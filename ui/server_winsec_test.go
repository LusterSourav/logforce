package main

import "testing"

func TestWindows4104Router(t *testing.T) {
	logs := []string{
		"LogName: Microsoft-Windows-PowerShell/Operational",
		"EventID: 4104",
		"Level: Information",
		"Description: Creating Scriptblock text...",
		`Write-Host "Checking for system updates..."`,
	}
	groups, gmap := groupLogsForClassification(logs)
	if len(groups) != 1 {
		t.Fatalf("expected 1 grouped event, got %d groups=%v", len(groups), groups)
	}
	joined := ""
	for _, g := range groups {
		for _, l := range g {
			joined += l + " | "
		}
	}
	typ, cat, _, ok := classifyWindowsGroup(joined)
	if !ok || typ != "SECURITY" {
		t.Fatalf("router missed 4104 block: ok=%v typ=%s cat=%s", ok, typ, cat)
	}
	if len(gmap) != len(logs) {
		t.Fatalf("group map len mismatch")
	}
	// malicious payload must escalate
	typ2, cat2, sev2, ok2 := classifyWindowsGroup(`EventID: 4104 ScriptBlockText Invoke-Mimikatz FromBase64String`)
	if !ok2 || cat2 != "malicious_script" || sev2 != "critical" || typ2 != "SECURITY" {
		t.Fatalf("malicious 4104 not flagged: %v %s %s %s", ok2, typ2, cat2, sev2)
	}
	// generic infra log must NOT hit router (falls through to ONNX)
	if _, _, _, ok3 := classifyDeterministic(`ERROR UserService connection refused host=db-primary`); ok3 {
		t.Fatalf("router overfires on generic log")
	}
	// OuterTune crash must NOT hit router (ONNX already gets ERROR/runtime_exception right)
	if _, _, _, ok := classifyDeterministic(`E OuterTune: CRASH: Unhandled exception NullPointer`); ok {
		t.Fatalf("router overfires on OuterTune crash")
	}
}

func TestNetworkVendorRouter(t *testing.T) {
	cases := []struct {
		name, log, typ, cat, sev string
	}{
		{"paloalto traffic", `<134>1 2026-09-14T10:00:00Z fw01 paloalto PAN-OS TRAFFIC,allow,src=10.0.0.5 dst=8.8.8.8`, "NETWORK", "traffic_flow", "info"},
		{"asa built conn", `%ASA-6-302013: Built inbound TCP connection 12345 for outside:1.2.3.4/443 to inside:10.0.0.5/52341`, "NETWORK", "firewall_session", "info"},
		{"asa deny", `%ASA-4-106023: Deny tcp src outside:1.2.3.4/1234 dst inside:10.0.0.5/80`, "NETWORK", "firewall_deny", "warning"},
		{"cef allow", `CEF:0|PaloAlto|PAN-OS|11.0|TRAFFIC|Traffic|1|act=allow src=10.0.0.5 dst=8.8.8.8`, "NETWORK", "traffic_flow", "info"},
		{"cef deny", `CEF:0|PaloAlto|PAN-OS|11.0|THREAT|Threat|9|act=block src=1.2.3.4 dst=10.0.0.5`, "SECURITY", "policy_deny", "warning"},
		{"suricata exploit", `{"event_type":"alert","src_ip":"1.2.3.4","dest_ip":"10.0.0.5","alert":{"signature":"ET EXPLOIT Possible CVE-2024-1234","severity":1}}`, "SECURITY", "ids_alert", "critical"},
		{"suricata et info capped", `{"event_type":"alert","alert":{"signature":"ET INFO Session Traversal Utilities for NAT (STUN Binding Request)","severity":1}}`, "SECURITY", "ids_alert", "high"},
		{"fortigate accept", `date=2026-09-14 devname=fg01 FortiGate action=accept src=10.0.0.5 dst=8.8.8.8`, "NETWORK", "traffic_flow", "info"},
	}
	for _, tc := range cases {
		typ, cat, sev, ok := classifyDeterministic(tc.log)
		if !ok || typ != tc.typ || cat != tc.cat || sev != tc.sev {
			t.Errorf("%s: got ok=%v %s/%s/%s, want %s/%s/%s", tc.name, ok, typ, cat, sev, tc.typ, tc.cat, tc.sev)
		}
	}
	// plain HTTP stays on ONNX
	if _, _, _, ok := classifyDeterministic(`HTTP 200 OK GET /api/users served in 12ms`); ok {
		t.Fatalf("router overfires on plain HTTP log")
	}
}

func TestAndroidCrashGrouping(t *testing.T) {
	logs := []string{
		"01-16 09:31:11.736  1234  5678 E AndroidRuntime: FATAL EXCEPTION: main",
		"Process: com.example.app, PID: 1234",
		"java.lang.NullPointerException: Attempt to invoke virtual method 'void android.widget.TextView.setText(java.lang.CharSequence)' on a null object reference",
		"<13>1 2024-01-16T09:31:11.736Z PaloAlto PA-220 - - - 2024/01/16 09:31:11,allow",
		"%ASA-6-302013: Built outbound TCP connection 12345 for outside:192.168.1.100/443",
	}
	groups, gmap := groupLogsForClassification(logs)
	if len(groups) != 3 {
		t.Fatalf("expected 3 groups (crash, paloalto, asa), got %d: %v", len(groups), groups)
	}
	if len(groups[0]) != 3 {
		t.Fatalf("crash fragmented: group0=%v", groups[0])
	}
	if len(gmap) != len(logs) {
		t.Fatalf("group map len mismatch")
	}
	// crash head must route deterministic, not REQUEST/success
	typ, cat, sev, ok := classifyDeterministic(groups[0][0] + " | " + groups[0][1] + " | " + groups[0][2])
	if !ok || typ != "ERROR" || cat != "runtime_exception" || sev != "error" {
		t.Fatalf("crash misrouted: ok=%v %s/%s/%s", ok, typ, cat, sev)
	}
	// ASA 6 must be info session, never error
	typ, cat, sev, ok = classifyDeterministic(logs[4])
	if !ok || typ != "NETWORK" || cat != "firewall_session" || sev != "info" {
		t.Fatalf("asa-6 misrouted: ok=%v %s/%s/%s", ok, typ, cat, sev)
	}
	// positional PaloAlto syslog without TRAFFIC token must still route
	typ, cat, _, ok = classifyDeterministic(logs[3])
	if !ok || typ != "NETWORK" || cat != "traffic_flow" {
		t.Fatalf("paloalto positional misrouted: ok=%v %s/%s", ok, typ, cat)
	}
}

func TestNewEventAnchors(t *testing.T) {
	anchors := []string{
		"01-16 09:31:11.736  1234  5678 E AndroidRuntime: boom",
		"<13>1 2024-01-16T09:31:11Z host app",
		"<134>1 2024-01-16T09:31:11Z fw01 paloalto",
		"%ASA-4-106023: Deny tcp",
		"%ASA-6-302013: Built inbound TCP connection",
		"CEF:0|Vendor|Prod|1|sig|name|5|act=allow",
		`{"event_type":"alert","signature":"x"}`,
		"LogName: Microsoft-Windows-PowerShell/Operational",
		"EventID: 4104",
	}
	for _, a := range anchors {
		if !isNewEventAnchor(a) {
			t.Errorf("anchor missed: %q", a)
		}
	}
	continuations := []string{
		"Process: com.example.app, PID: 1234",
		"    at com.example.Foo.bar(Foo.java:42)",
		"Caused by: java.io.IOException: broken pipe",
		"... 5 more",
		"java.lang.NullPointerException: null",
		`Write-Host "hi"`,
	}
	for _, c := range continuations {
		if isNewEventAnchor(c) {
			t.Errorf("continuation treated as anchor: %q", c)
		}
	}
}
