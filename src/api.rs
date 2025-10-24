use crate::action::Annotation;
use crate::card::Card;
use crate::game::Game;
use crate::pile::{Mark, Pile as BasePile};
use crate::rng::Seed;
use crate::score::Score;
use std::ffi::{c_char, CStr, CString};
use wasm_bindgen::prelude::*;

/// API level card pile data
#[repr(C)]
#[derive(Copy, Clone)]
pub struct Pile {
    pub cards: [u8; 20],
    pub value: u8,
    pub build: bool,
    pub owner: bool,
}

impl Default for Pile {
    fn default() -> Self {
        Pile {
            cards: [u8::from(Card::invalid()); 20],
            value: 0,
            build: false,
            owner: false,
        }
    }
}

impl From<Pile> for BasePile {
    fn from(pile: Pile) -> BasePile {
        let cards = pile
            .cards
            .iter()
            .filter(|&&x| x < 52)
            .map(|&x| Card::from(x))
            .collect::<Vec<Card>>();
        BasePile::new(
            cards.clone(),
            pile.value,
            match cards.len() {
                0 => Mark::Empty,
                1 => Mark::Single,
                _ => {
                    if pile.build {
                        Mark::Build
                    } else {
                        Mark::Group
                    }
                }
            },
        )
    }
}

/// Game status and telemetry
#[repr(C)]
pub struct Status {
    pub game: u8,
    pub round: u8,
    pub turn: bool,
    pub hand: u8,
    pub floor: u8,
    pub seed: Seed,
}

/// API level player scorecard
#[repr(C)]
#[derive(Copy, Clone, Debug, Default, Eq, PartialEq)]
pub struct Scorecard {
    pub aces: u8,
    pub most_cards: u8,
    pub most_spades: u8,
    pub suipi_count: u8,
    pub ten_of_diamonds: u8,
    pub two_of_spades: u8,
    pub total: u8,
}

impl Scorecard {
    fn dealer(score: &Score) -> Self {
        let points = score.dealer_points();
        Scorecard {
            aces: score.dealer_aces,
            most_cards: points[0],
            most_spades: points[1],
            suipi_count: points[2],
            ten_of_diamonds: points[3],
            two_of_spades: points[4],
            total: score.dealer_total(),
        }
    }

    fn opponent(score: &Score) -> Self {
        let points = score.opponent_points();
        Scorecard {
            aces: score.opponent_aces,
            most_cards: points[0],
            most_spades: points[1],
            suipi_count: points[2],
            ten_of_diamonds: points[3],
            two_of_spades: points[4],
            total: score.opponent_total(),
        }
    }
}

/// Initialize a new game from the given seed
///
/// # Safety
///
/// This function dereferences a raw pointer. If this pointer does not point to a valid Seed
/// struct, this function will fail.
#[no_mangle]
#[wasm_bindgen]
pub unsafe extern "C" fn new_game(seed: *const Seed) -> Box<Game> {
    let mut g = Game::default();
    if !seed.is_null() {
        g.seed(unsafe { *seed });
    }
    g.deal();
    Box::new(g)
}

/// Get the status signals for a game
#[no_mangle]
#[wasm_bindgen]
#[allow(clippy::borrowed_box)]
pub extern "C" fn status(g: &Box<Game>) -> Box<Status> {
    Box::new(Status {
        game: g.game,
        round: g.round,
        turn: g.state.turn,
        hand: g.state.player().card_count() as u8,
        floor: g.state.floor_count() as u8,
        seed: g.rng.rng_borrow().get_seed(),
    })
}

/// Read both player's hands, the current player's first
#[no_mangle]
#[wasm_bindgen]
#[allow(clippy::borrowed_box)]
pub extern "C" fn read_hands(g: &Box<Game>) -> Box<[u8; 16]> {
    let mut cards = [0; 16];
    for (i, c) in cards.iter_mut().enumerate() {
        let di = i % 8;
        let p = if g.state.turn ^ (i >= 8) {
            &g.state.dealer
        } else {
            &g.state.opponent
        };
        *c = u8::from(
            p.hand[di]
                .cards
                .first()
                .unwrap_or(&Card::invalid())
                .to_owned(),
        );
    }
    Box::new(cards)
}

/// Read the current floor piles
#[no_mangle]
#[wasm_bindgen]
#[allow(clippy::borrowed_box)]
pub extern "C" fn read_floor(g: &Box<Game>) -> Box<[Pile; 13]> {
    let mut piles = [Pile::default(); 13];
    for (i, p) in piles.iter_mut().enumerate() {
        let f = &g.state.floor[i];
        p.value = f.value;
        p.build = f.is_build();
        p.owner = f.owner;
        for (j, c) in f.cards.iter().enumerate() {
            p.cards[j] = u8::from(c.to_owned());
        }
    }
    Box::new(piles)
}

/// Attempt to apply a move to the game state
///
/// # Safety
///
/// This function calls `std::ffi::CStr::from_ptr`, which is an unsafe function.
#[no_mangle]
#[wasm_bindgen]
pub unsafe extern "C" fn apply_move(g: &mut Box<Game>, a: *const c_char) -> *const c_char {
    CString::new(
        if let Ok(annotation) = unsafe { CStr::from_ptr(a) }.to_str() {
            match Annotation::new(String::from(annotation)).to_move() {
                Err(e) => e.to_string(),
                Ok(m) => {
                    if let Err(e) = g.apply(m) {
                        e.to_string()
                    } else {
                        "".to_string() // Ok
                    }
                }
            }
        } else {
            "Error: Invalid CString".to_string()
        },
    )
    .unwrap()
    .into_raw()
}

/// End the current player's turn
#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn next_turn(g: &mut Box<Game>) {
    g.tick();
}

/// Undo the most recent move
#[no_mangle]
#[wasm_bindgen]
pub extern "C" fn undo(g: &mut Box<Game>) {
    g.undo();
}

/// Get an array of score cards for the completed games
#[no_mangle]
#[wasm_bindgen]
#[allow(clippy::borrowed_box)]
pub extern "C" fn get_scores(g: &Box<Game>) -> Box<[Scorecard; 4]> {
    let mut scores = [Scorecard::default(); 4];
    for (i, s) in g.scores.iter().enumerate() {
        let j = i * 2;
        if j > 2 {
            break;
        }
        scores[j] = Scorecard::opponent(s);
        scores[j + 1] = Scorecard::dealer(s);
    }
    Box::new(scores)
}
