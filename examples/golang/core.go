package main

// #cgo LDFLAGS: -lplaysuipi_core -L../../target/debug
// #include "../../target/playsuipi_core.h"
// #include <stdlib.h>
import "C"
import "unsafe"

const HandSize = 8
const FloorSize = 13
const ScoreSize = 4

type Game = *C.Game

// Suipi RNG seed.
type Seed = [32]uint8

// Game status and telemetry.
type StatusData struct {
	game  uint8
	round uint8
	turn  bool
	hand  uint8
	floor uint8
	seed  Seed
}

// API level card pile data.
type Pile struct {
	cards [20]uint8
	value uint8
	build bool
	owner bool
}

// API level player scorecard.
type Scorecard struct {
	aces            uint8
	most_cards      uint8
	most_spades     uint8
	suipi_count     uint8
	ten_of_diamonds uint8
	two_of_spades   uint8
	total           uint8
}

// Initialize a new game from the given seed.
func NewGame(seed Seed) Game {
	seed_data := [32]C.uint8_t{}
	for i, n := range seed {
		if i >= 32 {
			break
		}
		seed_data[i] = C.uint8_t(n)
	}
	g := C.new_game(&seed_data)
	return g
}

// Get the status signals for a game.
func Status(g Game) StatusData {
	seed := Seed{}
	data := C.status(&g)
	for i, n := range data.seed {
		if i >= 32 {
			break
		}
		seed[i] = uint8(n)
	}
	return StatusData{
		game:  uint8(data.game),
		round: uint8(data.round),
		turn:  bool(data.turn),
		hand:  uint8(data.hand),
		floor: uint8(data.floor),
		seed:  seed,
	}
}

// Read both player's hands, the current player's first.
func ReadHands(g Game) [HandSize * 2]uint8 {
	hand_data := [HandSize * 2]uint8{}
	data := C.read_hands(&g)
	for i, n := range data {
		if i >= HandSize*2 {
			break
		}
		hand_data[i] = uint8(n)
	}
	return hand_data
}

// Read the current floor piles.
func ReadFloor(g Game) [FloorSize]Pile {
	floor_data := [FloorSize]Pile{}
	data := C.read_floor(&g)
	for i, pile := range data {
		if i >= FloorSize {
			break
		}
		floor_data[i] = Pile{
			cards: [20]uint8{},
			value: uint8(pile.value),
			build: bool(pile.build),
			owner: bool(pile.owner),
		}
		for j, n := range pile.cards {
			if j >= 20 {
				break
			}
			floor_data[i].cards[j] = uint8(n)
		}
	}
	return floor_data
}

// Attempt to apply a move to the game state.
func ApplyMove(g Game, annotation string) string {
	data := C.CString(annotation)
	error := C.apply_move(&g, data)
	C.free(unsafe.Pointer(data))
	return C.GoString(error)
}

// End the current player's turn.
func NextTurn(g Game) {
	C.next_turn(&g)
}

// Undo the most recent move.
func Undo(g Game) {
	C.undo(&g)
}

// Get the score cards for the completed games.
func GetScores(g Game) [ScoreSize]Scorecard {
	score_data := [ScoreSize]Scorecard{}
	data := C.get_scores(&g)
	for i, sc := range data {
		score_data[i] = Scorecard{
			aces:            uint8(sc.aces),
			most_cards:      uint8(sc.most_cards),
			most_spades:     uint8(sc.most_spades),
			suipi_count:     uint8(sc.suipi_count),
			ten_of_diamonds: uint8(sc.ten_of_diamonds),
			two_of_spades:   uint8(sc.two_of_spades),
			total:           uint8(sc.total),
		}
	}
	return score_data
}
