# Go Reference Implementation

This is a simple CLI based Suipi game written in Go. It is a reference
implementation for using the Play Suipi Core library.

## Play Suipi

```bash
cd ./core
cargo build && make bindings
cd ./examples/golang
./play.sh
```

## Testing

Record your moves and replay them for quick in-game testing.

```bash
cd ./core
cargo build && make bindings
cd ./examples/golang
go build .
touch log.txt seed.txt
LD_LIBRARY_PATH="../../target/debug" ../../bin/record.py BINARY="./main"
```

## References

* [Download and install Go](https://go.dev/doc/install)
* [Go FFI Tutorial](https://useful.codes/foreign-function-interfaces-ffi-in-go/)
