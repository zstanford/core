//! GeoSweep's 52-shape, cumulative point-based tug-of-war. Numeric builds opt in to a ceiling of 13.
use super::choices_with_limit;
use playsuipi_core::{
    action::Annotation,
    card::Card,
    pile::{Mark, Pile},
    rng::Rng,
    state::State,
};
use serde_json::{json, Value};
use std::cell::RefCell;
const VERSION: u8 = 2;
const ROUNDS: u8 = 3;
fn special(c: &Card) -> u8 {
    if c.value == 1 {
        1
    } else if c.suit == 1 && c.value >= 10 {
        c.value - 8
    } else if c.suit == 3 && c.value == 2 {
        1
    } else {
        0
    }
}
fn card_json(c: &Card) -> Value {
    json!({"id":u8::from(*c),"value":c.value,"suit":c.suit,"points":special(c)})
}
#[derive(Clone, Debug, Default, PartialEq)]
struct Score {
    points: u16,
    captured: usize,
    gold: usize,
    ones: u16,
    diamonds: u16,
    gold_two: u16,
    sweeps: u16,
    most_shapes: u16,
    most_gold: u16,
}
impl Score {
    fn json(&self) -> Value {
        json!({"points":self.points,"captured":self.captured,"gold":self.gold,"ones":self.ones,"diamonds":self.diamonds,"goldTwo":self.gold_two,"sweeps":self.sweeps,"mostShapes":self.most_shapes,"mostGold":self.most_gold})
    }
}
fn scores(s: &State) -> [Score; 2] {
    let players = [&s.opponent, &s.dealer];
    let mut out: [Score; 2] = std::array::from_fn(|i| {
        let c = players[i].into_pair_cards();
        Score {
            captured: c.len(),
            gold: c.iter().filter(|c| c.suit == 3).count(),
            ones: c.iter().filter(|c| c.value == 1).count() as u16,
            diamonds: c
                .iter()
                .filter(|c| c.suit == 1 && c.value >= 10)
                .map(|c| special(c) as u16)
                .sum(),
            gold_two: c.iter().filter(|c| c.suit == 3 && c.value == 2).count() as u16,
            sweeps: players[i].suipi_count as u16,
            ..Score::default()
        }
    });
    for i in 0..2 {
        if out[i].captured > out[1 - i].captured {
            out[i].most_shapes = 3;
        }
        if out[i].gold > out[1 - i].gold {
            out[i].most_gold = 1;
        }
        let s = &mut out[i];
        s.points = s.ones + s.diamonds + s.gold_two + s.sweeps + s.most_shapes + s.most_gold;
    }
    out
}
fn lead(s: &State) -> i16 {
    let p = scores(s);
    p[0].points as i16 - p[1].points as i16
}
fn winner(a: i16, b: i16) -> Option<usize> {
    match a.cmp(&b) {
        std::cmp::Ordering::Greater => Some(0),
        std::cmp::Ordering::Less => Some(1),
        _ => None,
    }
}
fn pickup(s: &mut State) {
    let cards: Vec<Card> = s
        .floor
        .iter()
        .flat_map(|p| p.cards.iter().copied())
        .collect();
    if !cards.is_empty() {
        let p = Pile::new(cards, 0, Mark::Pair);
        if s.last_score {
            s.dealer.pairs.push(p);
        } else {
            s.opponent.pairs.push(p);
        }
        s.floor = vec![Pile::empty(); 13];
    }
}
struct Battle {
    state: State,
    seed: [u8; 32],
    round: u8,
    turns: u16,
    round_over: bool,
    results: Vec<Value>,
    history: Vec<Value>,
    last: String,
}
impl Battle {
    fn new(seed: Option<[u8; 32]>) -> Self {
        let mut rng = seed.map(Rng::from_seed).unwrap_or_default();
        let seed = rng.rng_borrow().get_seed();
        let mut state = State::default();
        state.init_deck();
        state.shuffle_deck(rng.rng_borrow_mut());
        state.deal_hands();
        state.floor = vec![Pile::empty(); 13];
        for i in 0..4 {
            loop {
                let c = state.deck.pop_front().unwrap();
                if special(&c) == 0
                    && !state
                        .floor
                        .iter()
                        .any(|p| !p.is_empty() && p.value == c.value)
                {
                    state.floor[i] = Pile::single(c);
                    break;
                }
                state.deck.push_back(c);
            }
        }
        Self {
            state,
            seed,
            round: 1,
            turns: 0,
            round_over: false,
            results: vec![],
            history: vec![],
            last: "Four starters. Eight shapes each. Capture points to pull the line.".into(),
        }
    }
    fn finished(&self) -> bool {
        self.results.len() == ROUNDS as usize
    }
    fn wins(&self) -> [usize; 2] {
        let mut w = [0; 2];
        for r in &self.results {
            if let Some(i) = r["winner"].as_u64() {
                w[i as usize] += 1;
            }
        }
        w
    }
    fn match_winner(&self) -> Option<usize> {
        if !self.finished() {
            return None;
        }
        let w = self.wins();
        winner(w[0] as i16, w[1] as i16).or_else(|| {
            let s = scores(&self.state);
            winner(s[0].points as i16, s[1].points as i16)
        })
    }
    fn snapshot(&self) -> Value {
        let s = scores(&self.state);
        json!({"version":VERSION,"round":self.round,"roundOver":self.round_over,"rounds":self.results,"roundWins":self.wins(),"deck":self.state.deck.len(),"turn":usize::from(self.state.turn),"turns":self.turns,"finished":self.finished(),"winner":self.match_winner(),
 "points":[s[0].points,s[1].points],"lead":lead(&self.state),"scores":[s[0].json(),s[1].json()],
 "hand":self.state.opponent.hand.iter().enumerate().filter(|(_,p)|!p.is_empty()).map(|(i,p)|{let mut c=card_json(&p.cards[0]);c["index"]=json!(i);c}).collect::<Vec<_>>(),"otherCount":self.state.dealer.card_count(),
 "floor":self.state.floor.iter().enumerate().filter(|(_,p)|!p.is_empty()).map(|(i,p)|{let suit=p.cards.first().filter(|c|p.cards.iter().all(|o|o.suit==c.suit)).map(|c|c.suit);json!({"index":i,"value":p.value,"parts":p.cards.iter().map(card_json).collect::<Vec<_>>(),"suit":suit,"points":p.cards.iter().map(|c|special(c) as u16).sum::<u16>(),"owner":if p.cards.len()>1{Some(usize::from(p.owner))}else{None},"locked":p.is_group()})}).collect::<Vec<_>>(),
 "capturedCards":[self.state.opponent.into_pair_cards().iter().map(card_json).collect::<Vec<_>>(),self.state.dealer.into_pair_cards().iter().map(card_json).collect::<Vec<_>>()],"captures":[s[0].captured,s[1].captured],"sweeps":[s[0].sweeps,s[1].sweeps],"last":self.last})
    }
    fn projected(&self, annotation: &str) -> Result<(State, bool), String> {
        let m = Annotation::new(annotation.into())
            .to_move()
            .map_err(|e| e.to_string())?;
        let mut next = self.state.clone();
        next.apply_with_limit(m, 13).map_err(|e| e.to_string())?;
        let sweep = next.floor_count() == 0;
        if sweep {
            next.player_mut().suipi_count += 1;
        }
        if self.round == 3 && next.opponent.card_count() == 0 && next.dealer.card_count() == 0 {
            pickup(&mut next);
        }
        Ok((next, sweep))
    }
    fn options(&self, a: &Value) -> Vec<Value> {
        if self.finished() || self.round_over {
            return vec![];
        }
        let Some(hand) = a["hand"].as_u64() else {
            return vec![];
        };
        let Ok(floor) = serde_json::from_value::<Vec<usize>>(a["floor"].clone()) else {
            return vec![];
        };
        let actor = usize::from(self.state.turn);
        let old = scores(&self.state);
        choices_with_limit(
            &self.state,
            hand as usize,
            &floor,
            a["kind"].as_str().unwrap_or(""),
            13,
        )
        .into_iter()
        .filter_map(|mut o| {
            let (next, sweep) = self.projected(o["annotation"].as_str()?).ok()?;
            let new = scores(&next);
            let sign = if actor == 0 { 1 } else { -1 };
            o["sweep"] = json!(sweep);
            o["shift"] = json!((lead(&next) - lead(&self.state)) * sign);
            o["captured"] = json!(new[actor].captured - old[actor].captured);
            o["points"] = json!(new[actor].points as i16 - old[actor].points as i16);
            Some(o)
        })
        .collect()
    }
    fn apply(&mut self, a: &Value) -> Result<Value, String> {
        let options = self.options(a);
        let Some(o) = options.iter().find(|o| o["annotation"] == a["annotation"]) else {
            return Err("That formation is not a legal move.".into());
        };
        let hand = a["hand"].as_u64().unwrap() as usize;
        let kind = a["kind"].as_str().unwrap();
        let floor: Vec<usize> = serde_json::from_value(a["floor"].clone()).unwrap();
        let actor = usize::from(self.state.turn);
        let card = self.state.player().hand[hand].cards[0];
        let parts: Vec<Value> = floor
            .iter()
            .flat_map(|i| self.state.floor[*i].cards.iter().map(card_json))
            .collect();
        let (next, sweep) = self.projected(a["annotation"].as_str().unwrap())?;
        self.state = next;
        self.turns += 1;
        let who = if actor == 0 { "You" } else { "Sentinel" };
        self.last = match kind {
            "capture" => format!(
                "{who} captured {} shapes. Point-lead shift: {:+}{}.",
                o["captured"],
                o["shift"].as_i64().unwrap(),
                if sweep { " · Sweep +1" } else { "" }
            ),
            "build" => format!(
                "{who} fused a formation at value {}. Original colors and points remain inside.",
                o["target"]
            ),
            _ => format!("{who} placed a shape with value {} on the field.", card.value),
        };
        self.state.turn = !self.state.turn;
        let mut round_end = Value::Null;
        if self.state.opponent.card_count() == 0 && self.state.dealer.card_count() == 0 {
            self.round_over = true;
            let s = scores(&self.state);
            round_end = json!({"round":self.round,"winner":winner(s[0].points as i16,s[1].points as i16),"points":[s[0].points,s[1].points],"lead":lead(&self.state)});
            self.results.push(round_end.clone());
        }
        Ok(
            json!({"actor":actor,"hand":hand,"kind":kind,"value":card.value,"suit":card.suit,"card":card_json(&card),"target":o["target"],"shift":o["shift"],"captured":o["captured"],"sweep":sweep,"floor":floor,"parts":parts,"roundEnd":round_end,"state":self.snapshot()}),
        )
    }
    // Search uses the active player's hand and public field, never the hidden opposing hand.
    fn best_move(&self) -> Option<Value> {
        if self.round_over || self.finished() {
            return None;
        }
        let indices: Vec<usize> = self
            .state
            .floor
            .iter()
            .enumerate()
            .filter(|(_, p)| !p.is_empty())
            .map(|(i, _)| i)
            .collect();
        let mut best: Option<(i32, Value)> = None;
        for (h, p) in self
            .state
            .player()
            .hand
            .iter()
            .enumerate()
            .filter(|(_, p)| !p.is_empty())
        {
            let targets: Vec<u16> = self
                .state
                .player()
                .hand
                .iter()
                .enumerate()
                .filter(|(i, p)| *i != h && !p.is_empty())
                .map(|(_, p)| p.value as u16)
                .collect();
            for mask in 0usize..(1 << indices.len()) {
                let floor: Vec<usize> = indices
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| mask & (1 << i) != 0)
                    .map(|(_, i)| *i)
                    .collect();
                let sum: u16 = floor
                    .iter()
                    .map(|i| self.state.floor[*i].value as u16)
                    .sum();
                for kind in ["capture", "build", "discard"] {
                    if (mask == 0) != (kind == "discard") {
                        continue;
                    }
                    if kind == "capture"
                        && (!sum.is_multiple_of(p.value as u16)
                            || floor.iter().any(|i| self.state.floor[*i].value > p.value))
                    {
                        continue;
                    }
                    if kind == "build"
                        && !targets.iter().any(|t| {
                            (sum + p.value as u16).is_multiple_of(*t)
                                && floor
                                    .iter()
                                    .all(|i| self.state.floor[*i].value as u16 <= *t)
                        })
                    {
                        continue;
                    }
                    let mut a = json!({"hand":h,"floor":floor,"kind":kind});
                    for o in self.options(&a) {
                        let risk = special(&p.cards[0]) as i32;
                        let score = if kind == "capture" {
                            1000 + o["shift"].as_i64().unwrap_or(0) as i32 * 120
                                + o["captured"].as_i64().unwrap_or(0) as i32 * 4
                        } else if kind == "build" {
                            40 - risk * 15 + o["target"].as_i64().unwrap_or(0) as i32
                        } else {
                            20 - risk * 20 - p.value as i32
                        };
                        if best.as_ref().is_none_or(|(s, _)| score > *s) {
                            a["annotation"] = o["annotation"].clone();
                            best = Some((score, a.clone()));
                        }
                    }
                }
            }
        }
        best.map(|(_, m)| m)
    }
    fn play(&mut self, a: &Value) -> Result<Value, String> {
        if self.finished() {
            return Err("Match finished. Start a new match.".into());
        }
        if self.round_over {
            return Err("Round finished. Continue to the next deal.".into());
        }
        if self.state.turn {
            return Err("Wait for Sentinel's turn.".into());
        }
        let mut events = vec![self.apply(a)?];
        self.history.push(a.clone());
        while self.state.turn && !self.round_over {
            let Some(rival) = self.best_move() else {
                return Err("Rival could not find a legal move.".into());
            };
            events.push(self.apply(&rival)?);
        }
        Ok(json!({"battle":self.snapshot(),"events":events}))
    }
    fn next_round(&mut self) -> Result<Value, String> {
        if !self.round_over || self.finished() {
            return Err("The next deal is not available.".into());
        }
        self.state.deal_hands();
        self.state.turn = false;
        self.round += 1;
        self.round_over = false;
        self.last = format!(
            "Round {}. Eight new shapes each; the battle line and field carry forward.",
            self.round
        );
        self.history.push(json!({"advance":true}));
        Ok(json!({"battle":self.snapshot()}))
    }
}
thread_local! {static BATTLE:RefCell<Option<Battle>>=const{RefCell::new(None)};}
pub fn request(a: Value) -> Value {
    BATTLE.with(|cell|{let mut saved=cell.borrow_mut();let b=saved.get_or_insert_with(||Battle::new(None));match a["type"].as_str().unwrap_or(""){
 "battle_new"=>{*b=Battle::new(serde_json::from_value(a["seed"].clone()).ok());json!({"battle":b.snapshot()})},
 "battle_state"=>json!({"battle":b.snapshot()}),"battle_choices"=>json!({"choices":if b.state.turn{vec![]}else{b.options(&a)}}),"battle_hint"=>json!({"hint":if b.state.turn{None}else{b.best_move()}}),
 "battle_play"=>b.play(&a).unwrap_or_else(|e|json!({"error":e})),"battle_next"=>b.next_round().unwrap_or_else(|e|json!({"error":e})),"battle_save"=>json!({"version":VERSION,"seed":b.seed,"moves":b.history}),
 "battle_restore"=>{
 if a["version"]!=VERSION{return json!({"error":"Saved battle uses an older ruleset. Start a new match."});}let Ok(seed)=serde_json::from_value::<[u8;32]>(a["seed"].clone())else{return json!({"error":"Invalid saved seed."});};let Some(moves)=a["moves"].as_array()else{return json!({"error":"Invalid saved moves."});};if moves.len()>26{return json!({"error":"Saved match exceeds turn limit."});}
 let mut restored=Battle::new(Some(seed));for m in moves{let r=if m["advance"]==true{restored.next_round()}else{restored.play(m)};if let Err(e)=r{return json!({"error":e});}}*b=restored;json!({"battle":b.snapshot()})},
 _=>json!({"error":"Unknown battle request."})}})
}
#[cfg(test)]
mod tests {
    use super::*;
    fn pile(v: u8, s: u8) -> Pile {
        Pile::single(Card::new(v, s))
    }
    fn fixture() -> Battle {
        let mut b = Battle::new(Some([0; 32]));
        b.state = State::default();
        b.state.floor = vec![Pile::empty(); 13];
        b.state.opponent.hand = vec![Pile::empty(); 8];
        b.state.dealer.hand = vec![Pile::empty(); 8];
        b.state.dealer.hand[0] = pile(9, 2);
        b
    }
    #[test]
    fn deck_setup_has_52_identities_and_four_plain_starters() {
        for seed in 0..8 {
            let b = Battle::new(Some([seed; 32]));
            assert_eq!(b.state.deck.len(), 32);
            assert_eq!(b.state.opponent.card_count(), 8);
            assert_eq!(b.state.dealer.card_count(), 8);
            assert_eq!(b.state.floor_count(), 4);
            assert!(b
                .state
                .floor
                .iter()
                .flat_map(|p| &p.cards)
                .all(|c| special(c) == 0));
            assert!(b.state.unique_floor());
        }
    }
    #[test]
    fn expanded_special_points_total_23() {
        let mut s = State::default();
        s.opponent.pairs = vec![Pile::new((0..52).map(Card::from).collect(), 0, Mark::Pair)];
        assert_eq!(scores(&s)[0].points, 23);
        assert_eq!(
            (10..=13)
                .map(|v| special(&Card::new(v, 1)))
                .collect::<Vec<_>>(),
            vec![2, 3, 4, 5]
        );
        assert_eq!(special(&Card::new(2, 3)), 1);
    }
    #[test]
    fn fusion_to_13_preserves_original_points_and_classic_limit() {
        let mut b = fixture();
        b.state.opponent.hand[0] = pile(3, 2);
        b.state.opponent.hand[1] = pile(13, 0);
        b.state.floor[0] = pile(10, 1);
        let mut a = json!({"hand":0,"floor":[0],"kind":"build"});
        let o = b.options(&a);
        assert_eq!(o.len(), 1);
        a["annotation"] = o[0]["annotation"].clone();
        b.apply(&a).unwrap();
        assert_eq!(b.state.floor[0].value, 13);
        assert_eq!(b.state.floor[0].cards.len(), 2);
        assert_eq!(b.state.floor[0].cards.iter().map(special).sum::<u8>(), 2);
        let mut a = pile(3, 2);
        let mut z = pile(10, 1);
        assert!(Pile::build(&mut a, &mut z).is_err());
    }
    #[test]
    fn eleven_twelve_thirteen_are_numeric_and_sweeps_are_one() {
        for target in 11..=13 {
            let mut b = fixture();
            b.state.opponent.hand[0] = pile(target, 1);
            b.state.floor[0] = pile(target - 1, 0);
            b.state.floor[1] = pile(1, 2);
            let mut a = json!({"hand":0,"floor":[0,1],"kind":"capture"});
            let o = b.options(&a);
            assert_eq!(o.len(), 1);
            a["annotation"] = o[0]["annotation"].clone();
            let e = b.apply(&a).unwrap();
            assert_eq!(e["sweep"], true);
            assert_eq!(b.state.opponent.suipi_count, 1);
            assert_eq!(b.state.opponent.into_pair_cards().len(), 3);
        }
    }
    #[test]
    fn majority_points_flip_and_ties_award_nothing() {
        let mut s = State::default();
        s.opponent.pairs = vec![Pile::new(
            vec![Card::new(3, 3), Card::new(4, 0)],
            0,
            Mark::Pair,
        )];
        s.dealer.pairs = vec![pile(5, 2)];
        assert_eq!(scores(&s)[0].most_shapes, 3);
        assert_eq!(scores(&s)[0].most_gold, 1);
        s.dealer.pairs.push(pile(6, 3));
        assert_eq!(scores(&s)[0].most_shapes, 0);
        assert_eq!(scores(&s)[1].most_shapes, 0);
        assert_eq!(scores(&s)[0].most_gold, 0);
        s.dealer.pairs.push(pile(7, 0));
        assert_eq!(scores(&s)[1].most_shapes, 3);
    }
    #[test]
    fn grouped_sevens_remain_seven_and_can_be_stolen() {
        let mut b = fixture();
        b.state.opponent.hand[0] = pile(7, 0);
        b.state.opponent.hand[1] = pile(7, 2);
        b.state.floor[0] = Pile::new(vec![Card::new(3, 0), Card::new(4, 1)], 7, Mark::Build);
        let mut a = json!({"hand":0,"floor":[0],"kind":"build"});
        let o = b.options(&a);
        assert_eq!(o.len(), 1);
        a["annotation"] = o[0]["annotation"].clone();
        b.apply(&a).unwrap();
        assert!(b.state.floor[0].is_group());
        assert_eq!(b.state.floor[0].value, 7);
        b.state.dealer.hand[0] = pile(7, 3);
        let mut a = json!({"hand":0,"floor":[0],"kind":"capture"});
        let o = b.options(&a);
        assert_eq!(o.len(), 1);
        a["annotation"] = o[0]["annotation"].clone();
        b.apply(&a).unwrap();
        assert_eq!(b.state.dealer.into_pair_cards().len(), 4);
    }
    #[test]
    fn invalid_action_is_atomic() {
        let mut b = Battle::new(Some([1; 32]));
        let old = b.snapshot();
        assert!(b
            .play(&json!({"hand":99,"floor":[],"kind":"capture","annotation":"bad"}))
            .is_err());
        assert_eq!(b.snapshot(), old);
    }
    #[test]
    fn mixed_twelve_keeps_gold_two_and_diamond_ten_points() {
        let mut b = fixture();
        b.state.opponent.hand[0] = pile(2, 3);
        b.state.opponent.hand[1] = pile(12, 0);
        b.state.floor[0] = pile(10, 1);
        let mut build = json!({"hand":0,"floor":[0],"kind":"build"});
        build["annotation"] = b.options(&build)[0]["annotation"].clone();
        b.apply(&build).unwrap();
        assert_eq!(b.state.floor[0].value, 12);
        assert_eq!(b.state.floor[0].cards.iter().map(special).sum::<u8>(), 3);
        b.state.turn = false;
        let mut capture = json!({"hand":1,"floor":[0],"kind":"capture"});
        capture["annotation"] = b.options(&capture)[0]["annotation"].clone();
        b.apply(&capture).unwrap();
        let score = scores(&b.state);
        assert_eq!(score[0].diamonds, 2);
        assert_eq!(score[0].gold_two, 1);
        assert_eq!(score[0].captured, 3);
    }
    #[test]
    fn final_pickup_goes_to_last_capturer_without_a_sweep() {
        let mut b = fixture();
        b.round = 3;
        b.state.dealer.hand.fill(Pile::empty());
        b.state.opponent.hand[0] = pile(4, 0);
        b.state.floor[0] = pile(5, 0);
        b.state.floor[1] = pile(6, 2);
        b.state.last_score = true;
        let mut drop = json!({"hand":0,"floor":[],"kind":"discard"});
        drop["annotation"] = b.options(&drop)[0]["annotation"].clone();
        let event = b.apply(&drop).unwrap();
        assert_eq!(event["sweep"], false);
        assert_eq!(b.state.dealer.into_pair_cards().len(), 3);
        assert_eq!(b.state.opponent.into_pair_cards().len(), 0);
        assert_eq!(b.state.floor_count(), 0);
        assert_eq!(b.state.dealer.suipi_count, 0);
        assert!(b.round_over);
    }
    #[test]
    fn full_matches_use_48_turns_conserve_cards_and_carry_points() {
        for seed in 0..12 {
            let mut b = Battle::new(Some([seed; 32]));
            while !b.finished() {
                let mut ids: Vec<u8> = b
                    .state
                    .deck
                    .iter()
                    .chain(b.state.opponent.hand.iter().flat_map(|p| &p.cards))
                    .chain(b.state.dealer.hand.iter().flat_map(|p| &p.cards))
                    .chain(b.state.floor.iter().flat_map(|p| &p.cards))
                    .chain(b.state.opponent.pairs.iter().flat_map(|p| &p.cards))
                    .chain(b.state.dealer.pairs.iter().flat_map(|p| &p.cards))
                    .copied()
                    .map(u8::from)
                    .collect();
                ids.sort_unstable();
                assert_eq!(ids, (0u8..52).collect::<Vec<_>>());
                if b.round_over {
                    let before = lead(&b.state);
                    let floor = b.state.floor.clone();
                    b.next_round().unwrap();
                    assert_eq!(lead(&b.state), before);
                    assert_eq!(b.state.floor, floor);
                    assert_eq!(b.state.opponent.card_count(), 8);
                } else {
                    let h = b.best_move().expect("legal move");
                    b.play(&h).unwrap();
                }
            }
            assert_eq!(b.turns, 48);
            assert_eq!(b.results.len(), 3);
            assert_eq!(
                b.state.opponent.into_pair_cards().len() + b.state.dealer.into_pair_cards().len(),
                52
            );
            assert_eq!(b.state.floor_count(), 0);
            let mut replay = Battle::new(Some(b.seed));
            for m in &b.history {
                if m["advance"] == true {
                    replay.next_round().unwrap();
                } else {
                    replay.play(m).unwrap();
                }
            }
            assert_eq!(replay.snapshot(), b.snapshot());
        }
    }
}
