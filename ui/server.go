package main

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kaminocorp/lumber/pkg/lumber"
	_ "github.com/lib/pq"
)

// global engine, lives for the whole process.
var lum *lumber.Lumber
var lumErr string
var pg *sql.DB

// ClassifyReq is what the dashboard posts. Keep it tiny.
type ClassifyReq struct {
	Logs      []string `json:"logs"`
	Verbosity string   `json:"verbosity"`
}

// HealthResp is used by the badge in the top bar. The UI polls it.
type HealthResp struct {
	Status         string  `json:"status"`
	Model          string  `json:"model"`
	Quantized      bool    `json:"quantized"`
	EmbedDim       int     `json:"embedDim"`
	TaxonomyLeaves int     `json:"taxonomyLeaves"`
	Threshold      float64 `json:"threshold"`
	LatencyMS      float64 `json:"latencyMs,omitempty"`
	Error          string  `json:"error,omitempty"`
}

func main() {
	modelDir := os.Getenv("LUMBER_MODEL_DIR")
	if modelDir == "" {
		for _, cand := range []string{
			"./models",
			"../models",
			"./models",
		} {
			if _, err := os.Stat(filepath.Join(cand, "model_quantized.onnx")); err == nil {
				modelDir = cand
				break
			}
		}
		if modelDir == "" {
			modelDir = "./models"
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "."
	}

	// load the model once. This pre embeds the 42 leaves so per request is just cosine.
	start := time.Now()
	l, err := lumber.New(lumber.WithModelDir(modelDir))
	if err != nil {
		lumErr = err.Error()
		log.Printf("WARN lumber not ready (%v) so API will return 503 and UI falls back to mock", err)
	} else {
		lum = l
		defer lum.Close()
		log.Printf("lumber ready dir=%s leaves=%d dim=%d took=%.0fms", modelDir, countLeaves(lum), 1024, time.Since(start).Seconds()*1000)
	}

	// try Postgres for the C path. Not fatal if it is down when running bare metal.
	if dsn := os.Getenv("PG_DSN"); dsn != "" {
		db, err := sql.Open("postgres", dsn)
		if err == nil {
			db.SetMaxOpenConns(5)
			if err := db.Ping(); err == nil {
				pg = db
				log.Printf("postgres ready dsn=%s", dsn)
			} else {
				log.Printf("WARN postgres ping failed (%v) so /api/ingest will use file fallback", err)
			}
		}
	}

	mux := http.NewServeMux()

	// allow the dashboard to call the API even when it is opened as file
	cors := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == "OPTIONS" {
				w.WriteHeader(204)
				return
			}
			next(w, r)
		}
	}

	mux.HandleFunc("/api/health", cors(handleHealth))
	mux.HandleFunc("/api/classify", cors(handleClassify))
	mux.HandleFunc("/api/ingest", cors(handleIngest))
	mux.HandleFunc("/api/query", cors(handleQuery))
	mux.HandleFunc("/api/stats", cors(handleStats))
	// tolerate .htm typo ,  redirect to .html so 404 never shows
	mux.HandleFunc("/dashboard.htm", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/dashboard.html", http.StatusMovedPermanently)
	})
	mux.HandleFunc("/dashboard-h612.htm", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/dashboard-h612.html", http.StatusMovedPermanently)
	})

	// serve the dashboard itself. dashboard.html lives next to this binary.
	// fix: only dashboard at /dashboard.html, no directory listing at /
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, filepath.Join(staticDir, "dashboard.html"))
			return
		}
		if r.URL.Path == "/dashboard.html" {
			http.ServeFile(w, r, filepath.Join(staticDir, "dashboard.html"))
			return
		}
		// block sensitive files and directory listing
		if strings.HasSuffix(r.URL.Path, ".go") || strings.HasSuffix(r.URL.Path, ".mod") || strings.HasSuffix(r.URL.Path, ".sum") || strings.HasSuffix(r.URL.Path, ".md") {
			http.NotFound(w, r)
			return
		}
		// for any other path, try to serve file but deny directory
		fpath := filepath.Join(staticDir, filepath.Clean(r.URL.Path))
		if info, err := os.Stat(fpath); err == nil && info.IsDir() {
			http.NotFound(w, r)
			return
		}
		http.FileServer(http.Dir(staticDir)).ServeHTTP(w, r)
	})

	addr := ":" + port
	log.Printf("ULPF listening on http://localhost%s  static=%s  model=%s", addr, staticDir, modelDir)
	log.Printf("try GET /api/health and POST /api/classify then open /dashboard.html")
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if lum == nil {
		json.NewEncoder(w).Encode(HealthResp{Status: "mock", Model: "mdbr-leaf-mt", Quantized: true, Error: lumErr})
		return
	}

	// do one real classify to measure warm latency. It warms the ORT session too.
	t0 := time.Now()
	_, _ = lum.Classify("health check probe")
	lat := time.Since(t0).Seconds() * 1000

	json.NewEncoder(w).Encode(HealthResp{
		Status: "ok", Model: "mdbr-leaf-mt", Quantized: true,
		EmbedDim: 1024, TaxonomyLeaves: countLeaves(lum), Threshold: 0.5, LatencyMS: lat,
	})
}

func handleClassify(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if lum == nil {
		w.WriteHeader(503)
		json.NewEncoder(w).Encode(map[string]string{"error": "model not loaded " + lumErr, "fallback": "mock"})
		return
	}

	var req ClassifyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(400)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	if len(req.Logs) == 0 {
		json.NewEncoder(w).Encode(map[string]interface{}{"events": []interface{}{}})
		return
	}

	t0 := time.Now()
	events, err := lum.ClassifyBatch(req.Logs)
	lat := time.Since(t0).Seconds() * 1000
	if err != nil {
		w.WriteHeader(500)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	// shape the response so the dashboard does not need to know Go internals
	type out struct {
		Type       string  `json:"type"`
		Category   string  `json:"category"`
		Severity   string  `json:"severity"`
		Timestamp  string  `json:"timestamp"`
		Summary    string  `json:"summary"`
		Confidence float64 `json:"confidence"`
		Raw        string  `json:"raw"`
	}
	outEvents := make([]out, len(events))
	for i, e := range events {
		outEvents[i] = out{
			Type: e.Type, Category: e.Category, Severity: e.Severity,
			Timestamp: e.Timestamp.Format(time.RFC3339Nano),
			Summary: e.Summary, Confidence: e.Confidence, Raw: e.Raw,
		}
	}
	w.Header().Set("X-Latency-Ms", fmt.Sprintf("%.1f", lat))
	json.NewEncoder(w).Encode(map[string]interface{}{"events": outEvents, "latencyMs": lat})
}

func outDir() string {
	// handle both bare metal (cwd is ui) and container (cwd is /app)
	for _, cand := range []string{"../output/normalized", "output/normalized", "/app/output/normalized"} {
		if _, err := os.Stat(filepath.Dir(cand)); err == nil {
			return cand
		}
	}
	return "output/normalized"
}

func handleIngest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	body := r.Body
	defer body.Close()
	qFmt := r.URL.Query().Get("format")

	base := outDir()
	_ = os.MkdirAll(base, 0755)
	// Hive dir uses today's date, not a hardcoded one. Parquet writer will do the same.
	now := time.Now()
	hive := filepath.Join(filepath.Dir(base), fmt.Sprintf("parquet/year=%d/month=%02d/day=%02d/class=4001/vendor=generic", now.Year(), now.Month(), now.Day()))
	_ = os.MkdirAll(hive, 0755)

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	var count, pgCount int
	var lastErr string

	outPath := filepath.Join(base, "perimeter-"+time.Now().Format("2006-01-02")+".ndjson")
	f, _ := os.OpenFile(outPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		count++
		// keep a copy for search even if JSON is slightly malformed
		if f != nil {
			fmt.Fprintln(f, line)
		}
		// try Postgres insert for the C demo. Keep file as fallback if DB is down.
		if pg != nil {
			var obj map[string]interface{}
			_ = json.Unmarshal([]byte(line), &obj)
			classUID := 4001
			if v, ok := obj["class_uid"]; ok {
				if fv, ok := v.(float64); ok {
					classUID = int(fv)
				}
			}
			vendor := "ulpf"
			if qFmt != "" {
				vendor = qFmt
			} else if m, ok := obj["metadata"].(map[string]interface{}); ok {
				if p, ok := m["product"].(map[string]interface{}); ok {
					if vn, ok := p["vendor_name"].(string); ok && vn != "" {
						vendor = vn
					}
				}
			} else if v, ok := obj["vendor"].(string); ok && v != "" {
				vendor = v
			} else if t, ok := obj["type"].(string); ok && t != "" {
				// lumber canonical has no vendor ,  use type as grouping
				vendor = t
			}
			_, err := pg.Exec(`insert into events (raw, class_uid, vendor) values ($1::jsonb, $2, $3)`, line, classUID, vendor)
			if err == nil {
				pgCount++
			} else {
				lastErr = err.Error()
			}
		}
	}
	if f != nil {
		f.Close()
	}

	resp := map[string]interface{}{
		"ingested": count,
		"pg_inserted": pgCount,
		"file": outPath,
	}
	if lastErr != "" && pgCount == 0 {
		resp["pg_error"] = lastErr
	}
	json.NewEncoder(w).Encode(resp)
}

func handleQuery(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	// Accept both { "sql": "SELECT ..." } and { "query": "class_uid=4001" }
	var req map[string]string
	_ = json.NewDecoder(r.Body).Decode(&req)
	sqlStr := req["sql"]
	if sqlStr == "" {
		sqlStr = req["query"]
	}
	if sqlStr == "" {
		sqlStr = r.URL.Query().Get("q")
	}
	// normalize the DataFusion style query the prototype docs show
	// we support two forms that prove prune
	// - raw SQL like SELECT * FROM lake WHERE class_uid=4001
	// - simple filter like class_uid=4001 or vendor=ulpf
	classFilter := 0
	vendorFilter := ""
	if strings.Contains(sqlStr, "4001") {
		classFilter = 4001
	}
	if strings.Contains(strings.ToLower(sqlStr), "ulpf") {
		vendorFilter = "ulpf"
	}

	base := outDir()
	pruned := 0
	scanned := 0
	matched := 0
	var rows []map[string]interface{}

	files, _ := filepath.Glob(filepath.Join(base, "*.ndjson"))
	hiveBase := filepath.Join(filepath.Dir(base), "parquet/year=*/month=*/day=*/class=*/vendor=*/*.ndjson")
	if base == "../output/normalized" {
		hiveBase = "../output/parquet/year=*/month=*/day=*/class=*/vendor=*/*.ndjson"
	}
	hiveFiles, _ := filepath.Glob(hiveBase)
	files = append(files, hiveFiles...)

	for _, fp := range files {
		// prune simulation - files under class=4001 are kept, others would be skipped
		// since prototype only has 4001, pruned stays 0 but we report the mechanism
		if classFilter == 4001 && !strings.Contains(fp, "class=4001") && strings.Contains(fp, "class=") {
			pruned++
			continue
		}
		scanned++
		b, err := os.ReadFile(fp)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(b), "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			if vendorFilter != "" && !strings.Contains(strings.ToLower(line), strings.ToLower(vendorFilter)) {
				continue
			}
			var obj map[string]interface{}
			if err := json.Unmarshal([]byte(line), &obj); err != nil {
				continue
			}
			// apply class filter if present
			if classFilter != 0 {
				if v, ok := obj["class_uid"]; ok {
					if fv, ok := v.(float64); !ok || int(fv) != classFilter {
						continue
					}
				} else {
					// lumber style events have no class_uid, skip when class filter asked
					continue
				}
			}
			matched++
			if len(rows) < 200 {
				rows = append(rows, obj)
			}
		}
	}

	// also try Postgres count for the same filter to prove Vector -> Postgres path
	pgCount := -1
	if pg != nil {
		q := `select count(*) from events where 1=1`
		args := []interface{}{}
		if classFilter != 0 {
			q += ` and class_uid = $1`
			args = append(args, classFilter)
		}
		var c int
		if err := pg.QueryRow(q, args...).Scan(&c); err == nil {
			pgCount = c
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"sql": sqlStr,
		"prune": map[string]int{
			"scanned_files": scanned,
			"pruned_files": pruned,
			"matched_rows": matched,
		},
		"pg_count": pgCount,
		"rows": rows,
	})
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	base := outDir()
	files, _ := filepath.Glob(filepath.Join(base, "*.ndjson"))
	var total, last24, normalized int
	buckets := make([]int, 12)
	bucketsNorm := make([]int, 12)
	bucketsRaw := make([]int, 12)
	sources := map[string]struct{}{}
	vendorCounts := map[string]int{}
	categoryCounts := map[string]int{}
	now := time.Now()
	for _, fp := range files {
		b, _ := os.ReadFile(fp)
		for _, line := range strings.Split(string(b), "\n") {
			if strings.TrimSpace(line) == "" {
				continue
			}
			total++
			var obj map[string]interface{}
			_ = json.Unmarshal([]byte(line), &obj)
			isNorm := false
			if t, ok := obj["type"].(string); ok && t != "" && t != "UNCLASSIFIED" {
				if _, ok := obj["category"]; ok {
					isNorm = true
				}
			} else if _, ok := obj["class_uid"]; ok {
				isNorm = true
			}
			if isNorm {
				normalized++
			}
			// sources distinct
			vendor := ""
			if m, ok := obj["metadata"].(map[string]interface{}); ok {
				if p, ok := m["product"].(map[string]interface{}); ok {
					if vn, ok := p["vendor_name"].(string); ok {
						vendor = vn
					}
				}
			}
			if vendor == "" {
				if v, ok := obj["vendor"].(string); ok && v != "" {
					vendor = v
				} else if t, ok := obj["type"].(string); ok && t != "" {
					vendor = t
				}
			}
			if vendor != "" {
				sources[vendor] = struct{}{}
				vendorCounts[vendor]++
			}
			cat := ""
			if c, ok := obj["category"].(string); ok {
				cat = c
			} else if v, ok := obj["vendor"].(string); ok {
				cat = v
			}
			if cat != "" {
				categoryCounts[cat]++
			}
			var t time.Time
			if ts, ok := obj["time"].(string); ok {
				t, _ = time.Parse(time.RFC3339, ts)
			}
			if ts, ok := obj["timestamp"].(string); ok && t.IsZero() {
				t, _ = time.Parse(time.RFC3339Nano, ts)
				if t.IsZero() {
					t, _ = time.Parse(time.RFC3339, ts)
				}
			}
			if t.IsZero() {
				if fi, err := os.Stat(fp); err == nil {
					t = fi.ModTime()
				} else {
					t = now
				}
			}
			if now.Sub(t) < 24*time.Hour {
				last24++
				bucket := int(now.Sub(t).Hours() / 2)
				if bucket >= 0 && bucket < 12 {
					buckets[11-bucket]++
					if isNorm {
						bucketsNorm[11-bucket]++
					} else {
						bucketsRaw[11-bucket]++
					}
				}
			}
		}
	}
	failed := total - normalized
	rate := 0
	if total > 0 {
		rate = normalized * 100 / total
	}
	pgCount := -1
	if pg != nil {
		_ = pg.QueryRow(`select count(*) from events`).Scan(&pgCount)
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total_events": total,
		"normalized": normalized,
		"failed": failed,
		"rate": rate,
		"sources": len(sources),
		"last_24h": last24,
		"buckets": buckets,
		"buckets_normalized": bucketsNorm,
		"buckets_raw": bucketsRaw,
		"vendor_counts": vendorCounts,
		"category_counts": categoryCounts,
		"pg_count": pgCount,
	})
}

func countLeaves(l *lumber.Lumber) int {
	n := 0
	for _, c := range l.Taxonomy() {
		n += len(c.Labels)
	}
	return n
}