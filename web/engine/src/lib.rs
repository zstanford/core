//! Browser adapter. Original Play Suipi engine remains unchanged.
use playsuipi_core::action::Annotation;
use playsuipi_core::game::Game;
use playsuipi_core::pile::Pile;
use playsuipi_core::state::State;
use serde_json::{json, Value};
use std::cell::RefCell;

#[cfg(target_arch = "wasm32")]
mod entropy {
    #[link(wasm_import_module = "env")]
    extern "C" {
        fn random_bytes(ptr: *mut u8, len: usize);
    }
    fn fill(buf: &mut [u8]) -> Result<(), getrandom::Error> {
        unsafe { random_bytes(buf.as_mut_ptr(), buf.len()) };
        Ok(())
    }
    getrandom::register_custom_getrandom!(fill);
}

#[derive(Clone)]
struct Item {
    label: String,
    pile: Pile,
    hand: bool,
}

fn subsets(items: &[Item], mask: usize, target: u8) -> Vec<usize> {
    let first = 1usize << mask.trailing_zeros();
    let mut result = vec![];
    let mut sub = mask;
    while sub > 0 {
        if sub & first != 0 {
            let chosen: Vec<_> = items
                .iter()
                .enumerate()
                .filter(|(i, _)| sub & (1 << i) != 0)
                .map(|(_, item)| item)
                .collect();
            if chosen.iter().map(|i| i.pile.value as u16).sum::<u16>() == target as u16 {
                // The upstream move parser combines additions from right to left.
                let mut pile = chosen.last().unwrap().pile.clone();
                let valid = chosen.iter().rev().skip(1).all(|item| {
                    let mut left = item.pile.clone();
                    match Pile::build(&mut left, &mut pile) {
                        Ok(p) => {
                            pile = p;
                            true
                        }
                        Err(_) => false,
                    }
                });
                if valid {
                    result.push(sub);
                }
            }
        }
        sub = (sub - 1) & mask;
    }
    result
}

fn partitions(items: &[Item], mask: usize, target: u8) -> Vec<Vec<usize>> {
    if mask == 0 {
        return vec![vec![]];
    }
    let mut results = vec![];
    for subset in subsets(items, mask, target) {
        for mut tail in partitions(items, mask ^ subset, target) {
            tail.insert(0, subset);
            results.push(tail);
        }
    }
    results
}

fn validate(state: &State, annotation: &str) -> bool {
    Annotation::new(annotation.to_owned())
        .to_move()
        .is_ok_and(|m| state.clone().apply(m).is_ok())
}

fn choices(state: &State, hand: usize, floor: &[usize], kind: &str) -> Vec<Value> {
    if hand >= state.player().hand.len()
        || state.player().hand[hand].is_empty()
        || floor.len() > 13
        || floor
            .iter()
            .any(|i| *i >= state.floor.len() || state.floor[*i].is_empty())
    {
        return vec![];
    }
    let mut indices = floor.to_vec();
    indices.sort_unstable();
    indices.dedup();
    if indices.len() != floor.len() {
        return vec![];
    }
    let hand_label = (hand + 1).to_string();
    if kind == "discard" {
        let annotation = format!("!{hand_label}");
        return if floor.is_empty() && validate(state, &annotation) {
            vec![json!({"annotation": annotation, "label": "Place card on table"})]
        } else {
            vec![]
        };
    }
    if floor.is_empty() || !matches!(kind, "capture" | "build") {
        return vec![];
    }
    let mut items: Vec<_> = indices
        .iter()
        .map(|&i| Item {
            label: ((b'A' + i as u8) as char).to_string(),
            pile: state.floor[i].clone(),
            hand: false,
        })
        .collect();
    let value = state.player().hand[hand].value;
    let targets = if kind == "capture" {
        vec![value]
    } else {
        items.push(Item {
            label: hand_label.clone(),
            pile: state.player().hand[hand].clone(),
            hand: true,
        });
        let mut targets: Vec<_> = state
            .player()
            .hand
            .iter()
            .enumerate()
            .filter(|(i, p)| *i != hand && !p.is_empty())
            .map(|(_, p)| p.value)
            .collect();
        targets.sort_unstable();
        targets.dedup();
        targets
    };
    let mut results = vec![];
    for target in targets {
        for mut groups in partitions(&items, (1 << items.len()) - 1, target) {
            // Put the hand-containing expression last, so it joins the destination pile.
            groups.sort_by_key(|mask| {
                items
                    .iter()
                    .enumerate()
                    .any(|(i, item)| item.hand && mask & (1 << i) != 0)
            });
            let expression = groups
                .iter()
                .map(|mask| {
                    items
                        .iter()
                        .enumerate()
                        .filter(|(i, _)| mask & (1 << i) != 0)
                        .map(|(_, item)| item.label.clone())
                        .collect::<Vec<_>>()
                        .join("+")
                })
                .collect::<Vec<_>>()
                .join("&");
            let annotation = if kind == "capture" {
                format!("*{expression}&{hand_label}")
            } else {
                format!("!{expression}")
            };
            if validate(state, &annotation) {
                let grouped = groups.len() > 1;
                results.push(json!({"annotation": annotation, "target": target,
                    "label": if kind == "capture" { "Capture selected cards".to_owned() }
                        else if grouped { format!("Group at {target} · locked value") }
                        else { format!("Build to {target}") }}));
                break;
            }
        }
    }
    results
}

struct Table {
    game: Game,
    moves: Vec<String>,
}

impl Table {
    fn new(seed: Option<[u8; 32]>) -> Self {
        let mut game = Game::default();
        if let Some(seed) = seed {
            game.seed(seed);
        }
        game.deal();
        Self {
            game,
            moves: vec![],
        }
    }

    fn snapshot(&self) -> Value {
        let g = &self.game;
        let seat = |dealer: bool| (usize::from(dealer) + g.game as usize % 2) % 2;
        let cards = |p: &Pile| p.cards.iter().map(|c| u8::from(*c)).collect::<Vec<_>>();
        let mut totals = [0u16; 2];
        let mut games = vec![];
        for (i, score) in g.scores.iter().enumerate().take(2) {
            let mut points = [0; 2];
            points[i % 2] = score.opponent_total();
            points[(i + 1) % 2] = score.dealer_total();
            if i < g.game as usize {
                totals[0] += points[0] as u16;
                totals[1] += points[1] as u16;
            }
            games.push(json!({"points": points, "complete": i < g.game as usize,
                "categories": [
                    {"name":"Aces", "points": [score.opponent_aces, score.dealer_aces]},
                    {"name":"Most cards", "points": [score.opponent_points()[0], score.dealer_points()[0]]},
                    {"name":"Most spades", "points": [score.opponent_points()[1], score.dealer_points()[1]]},
                    {"name":"Suipi difference", "points": [score.opponent_points()[2], score.dealer_points()[2]]},
                    {"name":"10♦", "points": [score.opponent_points()[3], score.dealer_points()[3]]},
                    {"name":"2♠", "points": [score.opponent_points()[4], score.dealer_points()[4]]}
                ], "opponentSeat": i % 2}));
        }
        let player = g.state.player();
        let other = if g.state.turn {
            &g.state.opponent
        } else {
            &g.state.dealer
        };
        json!({"game": g.game, "round": g.round, "turn": seat(g.state.turn),
            "finished": g.game >= 2, "deck": g.state.deck.len(), "totals": totals, "games": games,
            "hand": if g.game >= 2 { vec![] } else { player.hand.iter().enumerate().filter(|(_, p)| !p.is_empty())
                .map(|(i, p)| json!({"index":i,"card":cards(p)[0]})).collect::<Vec<_>>() },
            "otherCount": other.card_count(), "captured": player.into_pair_cards().len(),
            "otherCaptured": other.into_pair_cards().len(), "sweeps": player.suipi_count,
            "otherSweeps": other.suipi_count, "floor": g.state.floor.iter().enumerate().filter(|(_, p)| !p.is_empty())
                .map(|(i, p)| json!({"index":i,"value":p.value,"cards":cards(p),
                    "build":p.is_build(),"group":p.is_group(),"owner":seat(p.owner)})).collect::<Vec<_>>(),
            "moves": self.moves})
    }

    fn request(&mut self, request: Value) -> Value {
        match request["type"].as_str().unwrap_or("") {
            "new" => {
                *self = Table::new(None);
                json!({"state":self.snapshot()})
            }
            "state" => json!({"state":self.snapshot()}),
            "restore" => {
                let seed: Option<[u8; 32]> = serde_json::from_value(request["seed"].clone()).ok();
                let Some(seed) = seed else {
                    return json!({"error":"Saved game has an invalid seed."});
                };
                let Some(moves) = request["moves"].as_array() else {
                    return json!({"error":"Saved game has invalid moves."});
                };
                let mut restored = Table::new(Some(seed));
                for m in moves {
                    let Some(m) = m.as_str() else {
                        return json!({"error":"Saved move is invalid."});
                    };
                    if let Err(error) = restored.play(m) {
                        return json!({"error":error});
                    }
                }
                *self = restored;
                json!({"state":self.snapshot()})
            }
            "save" => json!({"seed":self.game.rng.rng_borrow().get_seed(),"moves":self.moves}),
            "choices" => {
                let Some(hand) = request["hand"].as_u64() else {
                    return json!({"choices":[]});
                };
                let floor: Vec<usize> = match serde_json::from_value(request["floor"].clone()) {
                    Ok(v) => v,
                    Err(_) => return json!({"choices":[]}),
                };
                if self.game.game >= 2 {
                    return json!({"choices":[]});
                }
                json!({"choices":choices(&self.game.state, hand as usize, &floor, request["kind"].as_str().unwrap_or(""))})
            }
            "play" => {
                let hand = request["hand"].as_u64().unwrap_or(usize::MAX as u64) as usize;
                let floor: Vec<usize> = match serde_json::from_value(request["floor"].clone()) {
                    Ok(v) => v,
                    Err(_) => return json!({"error":"Invalid table selection."}),
                };
                let options = choices(
                    &self.game.state,
                    hand,
                    &floor,
                    request["kind"].as_str().unwrap_or(""),
                );
                let annotation = request["annotation"].as_str().unwrap_or("");
                if !options.iter().any(|o| o["annotation"] == annotation) {
                    return json!({"error":"That move is not legal. Choose a different selection."});
                }
                match self.play(annotation) {
                    Ok(sweep) => json!({"state":self.snapshot(), "sweep":sweep}),
                    Err(error) => json!({"error":error}),
                }
            }
            _ => json!({"error":"Unknown request."}),
        }
    }

    fn play(&mut self, annotation: &str) -> Result<bool, String> {
        if self.game.game >= 2 {
            return Err("Match finished. Start a new match.".into());
        }
        // Saved annotations must pass the parser and contain only actual addresses.
        if annotation.is_empty() || !annotation.len().is_multiple_of(2) || annotation.len() > 28 {
            return Err("Invalid move.".into());
        }
        let m = Annotation::new(annotation.into())
            .to_move()
            .map_err(|e| e.to_string())?;
        self.game.apply(m).map_err(|e| e.to_string())?;
        let sweep = self.game.state.floor_count() == 0;
        self.game.tick();
        self.moves.push(annotation.into());
        Ok(sweep)
    }
}

thread_local! {
    static TABLE: RefCell<Option<Table>> = const { RefCell::new(None) };
    static OUTPUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

#[no_mangle]
pub extern "C" fn allocate(len: usize) -> *mut u8 {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut u8
}

/// # Safety
/// `ptr` and `len` must describe a buffer returned by `allocate`, freed exactly once.
#[no_mangle]
pub unsafe extern "C" fn release(ptr: *mut u8, len: usize) {
    drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)));
}

/// # Safety
/// `ptr` and `len` must describe a live allocated input buffer.
#[no_mangle]
pub unsafe extern "C" fn request(ptr: *const u8, len: usize) -> *const u8 {
    let input = std::slice::from_raw_parts(ptr, len);
    let response = match serde_json::from_slice::<Value>(input) {
        Err(_) => json!({"error":"Invalid request."}),
        Ok(input) => TABLE.with(|table| {
            table
                .borrow_mut()
                .get_or_insert_with(|| Table::new(None))
                .request(input)
        }),
    };
    OUTPUT.with(|out| {
        *out.borrow_mut() = serde_json::to_vec(&response).unwrap();
        out.borrow().as_ptr()
    })
}

#[no_mangle]
pub extern "C" fn output_len() -> usize {
    OUTPUT.with(|out| out.borrow().len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use playsuipi_core::card::{Card, Suit, Value as Rank};
    fn single(rank: Rank) -> Pile {
        Pile::single(Card::create(rank, Suit::Clubs))
    }
    #[test]
    fn capture_adds_and_groups_with_one_card() {
        let mut state = State::default();
        state.opponent.hand = vec![single(Rank::Ten)];
        state.floor = vec![single(Rank::Four), single(Rank::Six), single(Rank::Ten)];
        let options = choices(&state, 0, &[0, 1, 2], "capture");
        assert_eq!(options.len(), 1);
        assert!(validate(&state, options[0]["annotation"].as_str().unwrap()));
    }
    #[test]
    fn build_requires_retained_capture_card() {
        let mut state = State::default();
        state.opponent.hand = vec![single(Rank::Three), single(Rank::Seven)];
        state.floor = vec![single(Rank::Four)];
        assert_eq!(choices(&state, 0, &[0], "build").len(), 1);
        state.opponent.hand.pop();
        assert!(choices(&state, 0, &[0], "build").is_empty());
    }
    #[test]
    fn invalid_indices_and_duplicate_selection_are_rejected() {
        let table = Table::new(Some([0; 32]));
        assert!(choices(&table.game.state, 99, &[], "discard").is_empty());
        assert!(choices(&table.game.state, 0, &[0, 0], "capture").is_empty());
        assert!(choices(&table.game.state, 0, &[13], "capture").is_empty());
    }
    #[test]
    fn saved_match_replays_exactly() {
        let mut table = Table::new(Some([0; 32]));
        let option = (0..8)
            .flat_map(|h| choices(&table.game.state, h, &[], "discard"))
            .next()
            .unwrap();
        table.play(option["annotation"].as_str().unwrap()).unwrap();
        let save = table.request(json!({"type":"save"}));
        let mut restored = Table::new(None);
        let result =
            restored.request(json!({"type":"restore","seed":save["seed"],"moves":save["moves"]}));
        assert_eq!(result["state"], table.snapshot());
    }
}
