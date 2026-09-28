package redirect

import "testing"

func TestMergeUTM(t *testing.T) {
	cases := []struct {
		dest string
		utm  UTM
		want string
	}{
		{"https://example.com", UTM{Source: "qr"}, "https://example.com?utm_source=qr"},
		{"https://example.com/p?a=1&b=2", UTM{Source: "qr", Medium: "print"}, "https://example.com/p?a=1&b=2&utm_source=qr&utm_medium=print"},
		{"https://example.com/?utm_source=keep", UTM{Source: "qr", Campaign: "summer sale"}, "https://example.com/?utm_source=keep&utm_campaign=summer+sale"},
		{"https://example.com/#frag", UTM{Content: "a&b"}, "https://example.com/?utm_content=a%26b#frag"},
		{"https://example.com/x", UTM{}, "https://example.com/x"},
	}
	for _, c := range cases {
		if got := MergeUTM(c.dest, c.utm); got != c.want {
			t.Errorf("MergeUTM(%q) = %q, want %q", c.dest, got, c.want)
		}
	}
}
