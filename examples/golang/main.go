package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// LoadSeed attempts to read a series of up to 32 positive integers, from a
// file at the given `seed_path`, into an array.
//
// The seed file must only contain a single integer per line, with no blank
// lines. Lines must be broken with a null character "\n".
func LoadSeed(seed_path string) (Seed, error) {
	seed := Seed{}
	data, err := os.ReadFile(seed_path)
	if err != nil {
		return seed, err
	}
	for i, val := range strings.Split(string(data), "\n") {
		if i >= 32 {
			break
		}
		n, err := strconv.Atoi(val)
		if err != nil {
			return seed, nil
		}
		seed[i] = uint8(n)
	}
	return seed, nil
}

// SuitString will convert the given playing card suit into its corresponding
// unicode icon string representation.
func SuitString(s uint8) string {
	str := "_"
	switch s {
	case 0:
		str = "♣"
		break
	case 1:
		str = "♦"
		break
	case 2:
		str = "♥"
		break
	case 3:
		str = "♠"
	default:
		break
	}
	return str
}

// ValueString will convert the given playing card value into its corresponding
// string representation.
func ValueString(v uint8) string {
	if v > 13 || v <= 0 {
		return "_"
	}
	if v == 1 {
		return "A"
	}
	if v == 11 {
		return "J"
	}
	if v == 12 {
		return "Q"
	}
	if v == 13 {
		return "K"
	}
	return strconv.Itoa(int(v))
}

// CardString will convert the given playing card into a string representation.
func CardString(card uint8) string {
	if card >= 52 || card < 0 {
		return "__"
	}
	v := (card % 13) + 1
	s := card / 13
	return ValueString(v) + SuitString(s)
}

// PrintFloor will display the given game's current floor state, in a text
// format, by printing to os.Stdout.
func PrintFloor(g Game, s StatusData) {
	floor := ReadFloor(g)
	fmt.Print("Floor: ")
	for i, pile := range floor {
		if i != 0 {
			fmt.Print(", ")
		}
		fmt.Printf("%c=", 'A'+i)
		single := pile.cards[1] >= 52
		wrap := "[]"
		if pile.build {
			wrap = "{}"
		}
		owned := ""
		if pile.owner == s.turn {
			owned = "*"
		}
		if single {
			fmt.Print("(")
		} else {
			fmt.Printf("%s%s%c", owned, ValueString(pile.value), wrap[0])
		}
		for j, card := range pile.cards {
			if card < 52 {
				if j != 0 {
					fmt.Print(" + ")
				}
				fmt.Print(CardString(card))
			}
		}
		if single {
			fmt.Print(")")
		} else {
			fmt.Printf("%c", wrap[1])
		}
	}
	fmt.Print("\n")
}

// PrintHand will display the hand state of the current player in the given
// game, in a text format, by printing to os.Stdout.
func PrintHand(g Game) {
	hand := ReadHands(g)
	fmt.Print("Hand: ")
	for i, card := range hand {
		if i >= HandSize {
			break
		}
		if i != 0 {
			fmt.Print(", ")
		}
		fmt.Printf("%d=(", i+1)
		fmt.Print(CardString(card))
		fmt.Print(")")
	}
	fmt.Print("\n")
}

// PrintScores will display the given opponent and dealer scorecards, in a text
// based table format, by printing to os.Stdout.
func PrintScores(opp Scorecard, dealer Scorecard) {
	fmt.Printf(
		"[*] Scores:\n\n"+
			"Player | Aces | Most Cards | Most Spades | 10♦ | 2♠ | Suipis | Total\n"+
			"------ | ---- | ---------- | ----------- | --- | -- | ------ | -----\n"+
			"Opp    |    %d |          %d |           %d |   %d |  %d |      %d |  "+
			"%d\n"+
			"Dealer |    %d |          %d |           %d |   %d |  %d |      %d |  "+
			"%d\n",
		opp.aces, opp.most_cards, opp.most_spades, opp.ten_of_diamonds,
		opp.two_of_spades, opp.suipi_count, opp.total, dealer.aces,
		dealer.most_cards, dealer.most_spades, dealer.ten_of_diamonds,
		dealer.two_of_spades, dealer.suipi_count, dealer.total,
	)
}

// GetMove will attempt to read a Suipi annotation string from os.Stdin.
//
// In the event that we fail to read a string from os.Stdin, a blank string
// will be returned.
func GetMove() string {
	reader := bufio.NewReader(os.Stdin)
	fmt.Println("> Input your move below:")
	text, err := reader.ReadString('\n')
	if err != nil {
		return ""
	}
	return text
}

func main() {
	var seed Seed
	if len(os.Args) > 1 {
		dSeed, err := LoadSeed(os.Args[1])
		if err == nil {
			seed = dSeed
		}
	}
	fmt.Println("[*] Seed:", seed)
	g := NewGame(seed)
	s := Status(g)
	gameIndex := s.game
	roundIndex := s.round
	for s.game < 2 {
		if s.turn {
			fmt.Println("\n[*] Dealer's turn:")
		} else {
			fmt.Println("\n[*] Opponent's turn:")
		}
		PrintFloor(g, s)
		PrintHand(g)
		var err string
		for {
			if len(err) > 0 {
				fmt.Println("[!]", err)
			}
			m := GetMove()
			err = ApplyMove(g, m)
			if len(err) == 0 {
				break
			}
		}
		NextTurn(g)
		s = Status(g)
		if s.floor == 0 {
			fmt.Println("\n\n ===== SUIPI! =====\n")
		}
		if gameIndex != s.game {
			scores := GetScores(g)
			PrintScores(scores[gameIndex*2], scores[(gameIndex*2)+1])
			fmt.Println("\n\n ===== Next Game =====\n")
			gameIndex = s.game
			roundIndex = s.round
		} else if roundIndex != s.round {
			fmt.Println("\n\n ==== Next Round =====\n")
			roundIndex = s.round
		}
	}
	fmt.Println("\n\n")
}
