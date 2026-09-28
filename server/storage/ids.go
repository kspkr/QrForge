package storage

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"
)

const idAlphabet = "0123456789abcdefghijklmnopqrstuvwxyz"

// RandomString returns n characters drawn uniformly from alphabet using crypto/rand.
func RandomString(n int, alphabet string) string {
	max := big.NewInt(int64(len(alphabet)))
	b := make([]byte, n)
	for i := range b {
		v, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic("crypto/rand failed: " + err.Error())
		}
		b[i] = alphabet[v.Int64()]
	}
	return string(b)
}

// NewID returns a prefixed random identifier such as "qr_k3j9x0...".
func NewID(prefix string) string {
	return prefix + "_" + RandomString(16, idAlphabet)
}

var (
	sortableMu   sync.Mutex
	sortableLast int64
)

// NewSortableID returns an identifier whose lexical order follows creation
// order (nanosecond timestamp, monotonic within the process) so rows created
// within the same second still sort correctly.
func NewSortableID(prefix string) string {
	sortableMu.Lock()
	n := time.Now().UnixNano()
	if n <= sortableLast {
		n = sortableLast + 1
	}
	sortableLast = n
	sortableMu.Unlock()
	return fmt.Sprintf("%s_%019d%s", prefix, n, RandomString(6, idAlphabet))
}
