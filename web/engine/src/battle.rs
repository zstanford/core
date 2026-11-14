//! Geometric combat rules built on the original Suipi State and move validator.
use super::choices;
use playsuipi_core::{
    action::Annotation,
    card::Card,
    pile::Pile,
    rng::{Rng, SliceRandom},
    state::{Player, State},
};
use serde_json::{json, Value};
use std::{cell::RefCell, collections::VecDeque};

const HULL: u8 = 60;
const SWEEP_DAMAGE: u8 = 8;

struct Battle {
    state: State,
    seed: [u8; 32],
    hull: [u8; 2],
    turns: u16,
    history: Vec<Value>,
    last: String,
}

impl Battle {
    fn new(seed: Option<[u8; 32]>) -> Self {
        let mut rng = seed.map(Rng::from_seed).unwrap_or_default();
        let seed = rng.rng_borrow().get_seed();
        // Six energy tiers, four instances per tier. Opening teaches 3 + 4 = 7.
        let human = [3, 4, 7, 5, 8].map(|v| Card::new(v, 0));
        let rival = [3, 4, 7, 6, 8].map(|v| Card::new(v, 2));
        let floor = [Card::new(3, 1), Card::new(4, 1)];
        let used: Vec<Card> = human.iter().chain(&rival).chain(&floor).copied().collect();
        let mut deck: Vec<Card> = (0..4)
            .flat_map(|s| (3..=8).map(move |v| Card::new(v, s)))
            .filter(|c| !used.contains(c))
            .collect();
        deck.shuffle(rng.rng_borrow_mut());
        let mut piles: Vec<Pile> = floor.into_iter().map(Pile::single).collect();
        piles.resize_with(13, Pile::empty);
        Self {
            state: State {
                deck: VecDeque::from(deck),
                floor: piles,
                opponent: Player::new(human.into_iter().map(Pile::single).collect()),
                dealer: Player::new(rival.into_iter().map(Pile::single).collect()),
                ..State::default()
            },
            seed,
            hull: [HULL; 2],
            turns: 0,
            history: vec![],
            last: "Combine battlefield energy. Leave no formation unguarded.".into(),
        }
    }

    fn finished(&self) -> bool {
        self.hull.contains(&0)
            || (self.state.deck.is_empty()
                && self.state.opponent.card_count() == 0
                && self.state.dealer.card_count() == 0)
    }

    fn snapshot(&self) -> Value {
        let finished = self.finished();
        json!({"hull":self.hull,"maxHull":HULL,"deck":self.state.deck.len(),"turn":u8::from(self.state.turn),
            "turns":self.turns,"finished":finished,
            "winner":if finished { match self.hull[0].cmp(&self.hull[1]) { std::cmp::Ordering::Greater=>json!(0),std::cmp::Ordering::Less=>json!(1),_=>Value::Null } } else {Value::Null},
            "hand": self.state.opponent.hand.iter().enumerate().filter(|(_,p)|!p.is_empty()).map(|(i,p)|json!({"index":i,"value":p.value})).collect::<Vec<_>>(),
            "otherCount":self.state.dealer.card_count(),
            "floor":self.state.floor.iter().enumerate().filter(|(_,p)|!p.is_empty()).map(|(i,p)|json!({"index":i,"value":p.value,"parts":p.cards.iter().map(|c|c.value).collect::<Vec<_>>(),"owner":if p.cards.len()>1 {json!(u8::from(p.owner))}else{Value::Null},"locked":p.is_group()})).collect::<Vec<_>>(),
            "captures":[self.state.opponent.into_pair_cards().len(),self.state.dealer.into_pair_cards().len()],
            "sweeps":[self.state.opponent.suipi_count,self.state.dealer.suipi_count],"last":self.last})
    }

    fn options(&self, args: &Value) -> Vec<Value> {
        if self.finished() {
            return vec![];
        }
        let Some(hand) = args["hand"].as_u64() else {
            return vec![];
        };
        let Ok(floor) = serde_json::from_value::<Vec<usize>>(args["floor"].clone()) else {
            return vec![];
        };
        let kind = args["kind"].as_str().unwrap_or("");
        let v = self
            .state
            .player()
            .hand
            .get(hand as usize)
            .map(|p| p.value)
            .unwrap_or(0);
        choices(&self.state, hand as usize, &floor, kind)
            .into_iter()
            .map(|mut o| {
                let sweep = kind == "capture" && floor.len() == self.state.floor_count();
                o["damage"] = json!(if kind == "capture" {
                    v * 2 + if sweep { SWEEP_DAMAGE } else { 0 }
                } else {
                    0
                });
                o["sweep"] = json!(sweep);
                o
            })
            .collect()
    }

    fn apply(&mut self, args: &Value) -> Result<Value, String> {
        let options = self.options(args);
        let Some(option) = options
            .iter()
            .find(|o| o["annotation"] == args["annotation"])
        else {
            return Err("That formation is not a legal move.".into());
        };
        let hand = args["hand"].as_u64().unwrap() as usize;
        let floor: Vec<usize> = serde_json::from_value(args["floor"].clone()).unwrap();
        let kind = args["kind"].as_str().unwrap();
        let actor = usize::from(self.state.turn);
        let value = self.state.player().hand[hand].value;
        let parts: Vec<u8> = floor
            .iter()
            .flat_map(|i| self.state.floor[*i].cards.iter().map(|c| c.value))
            .collect();
        let m = Annotation::new(args["annotation"].as_str().unwrap().into())
            .to_move()
            .map_err(|e| e.to_string())?;
        let mut next = self.state.clone();
        next.apply(m).map_err(|e| e.to_string())?;
        self.state = next;
        let damage = option["damage"].as_u64().unwrap() as u8;
        self.hull[1 - actor] = self.hull[1 - actor].saturating_sub(damage);
        if option["sweep"] == true {
            self.state.player_mut().suipi_count += 1;
        }
        self.turns += 1;
        let who = if actor == 0 { "You" } else { "Sentinel" };
        self.last = match kind {
            "capture" => format!(
                "{who} struck for {damage} damage{}.",
                if option["sweep"] == true {
                    " · SUIPI"
                } else {
                    ""
                }
            ),
            "build" => format!("{who} forged a formation. It can be stolen."),
            _ => format!("{who} deployed a shape into shared space."),
        };
        // Draw into the consumed slot; the opponent does not see this identity.
        if let Some(card) = self.state.deck.pop_front() {
            self.state.player_mut().hand[hand] = Pile::single(card);
        }
        self.state.turn = !self.state.turn;
        if self.state.player().card_count() == 0 && !self.finished() {
            self.state.turn = !self.state.turn;
        }
        Ok(
            json!({"actor":actor,"hand":hand,"kind":kind,"value":value,"target":option["target"],"damage":damage,"sweep":option["sweep"],"floor":floor,"parts":parts,"state":self.snapshot()}),
        )
    }

    // Rival searches legal moves using only its hand and public floor. No hidden-hand lookahead.
    fn best_move(&self) -> Option<Value> {
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
            for kind in ["capture", "build", "discard"] {
                for mask in 0usize..(1 << indices.len()) {
                    if (mask == 0) != (kind == "discard") {
                        continue;
                    }
                    let floor: Vec<usize> = indices
                        .iter()
                        .enumerate()
                        .filter(|(i, _)| mask & (1 << i) != 0)
                        .map(|(_, i)| *i)
                        .collect();
                    let mut args = json!({"hand":h,"floor":floor,"kind":kind});
                    for option in self.options(&args) {
                        let score = if kind == "capture" {
                            1000 + option["damage"].as_i64().unwrap_or(0) as i32 * 10
                                + floor.len() as i32
                        } else if kind == "build" {
                            100 + option["target"].as_i64().unwrap_or(0) as i32
                        } else {
                            10 - p.value as i32
                        };
                        if best.as_ref().is_none_or(|(s, _)| score > *s) {
                            args["annotation"] = option["annotation"].clone();
                            best = Some((score, args.clone()));
                        }
                    }
                }
            }
        }
        best.map(|(_, args)| args)
    }

    fn play(&mut self, args: &Value) -> Result<Value, String> {
        if self.finished() {
            return Err("Skirmish finished. Start a new battle.".into());
        }
        if self.state.turn {
            return Err("Wait for Sentinel's turn.".into());
        }
        let mut events = vec![self.apply(args)?];
        self.history.push(args.clone());
        while self.state.turn && !self.finished() {
            let Some(rival) = self.best_move() else {
                return Err("Rival could not find a legal move.".into());
            };
            events.push(self.apply(&rival)?);
        }
        Ok(json!({"battle":self.snapshot(),"events":events}))
    }
}

thread_local! {static BATTLE:RefCell<Option<Battle>>=const{RefCell::new(None)};}

pub fn request(args: Value) -> Value {
    BATTLE.with(|cell|{
        let mut saved=cell.borrow_mut();
        let battle=saved.get_or_insert_with(||Battle::new(None));
        match args["type"].as_str().unwrap_or("") {
            "battle_new"=>{let seed=serde_json::from_value(args["seed"].clone()).ok();*battle=Battle::new(seed);json!({"battle":battle.snapshot()})},
            "battle_state"=>json!({"battle":battle.snapshot()}),
            "battle_choices"=>json!({"choices":if battle.state.turn {vec![]}else{battle.options(&args)}}),
            "battle_hint"=>json!({"hint":if battle.state.turn||battle.finished(){None}else{battle.best_move()}}),
            "battle_play"=>battle.play(&args).unwrap_or_else(|e|json!({"error":e})),
            "battle_save"=>json!({"seed":battle.seed,"moves":battle.history}),
            "battle_restore"=>{
                let Ok(seed)=serde_json::from_value::<[u8;32]>(args["seed"].clone()) else {return json!({"error":"Invalid saved seed."});};
                let Some(moves)=args["moves"].as_array() else {return json!({"error":"Invalid saved moves."});};
                if moves.len()>32 {return json!({"error":"Saved battle exceeds turn limit."});}
                let mut restored=Battle::new(Some(seed));
                for m in moves {if let Err(e)=restored.play(m){return json!({"error":e});}}
                *battle=restored;json!({"battle":battle.snapshot()})
            },
            _=>json!({"error":"Unknown battle request."}),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn opening_capture_awards_damage_and_sweep() {
        let mut b = Battle::new(Some([0; 32]));
        let mut args = json!({"hand":2,"floor":[0,1],"kind":"capture"});
        let o = b.options(&args);
        assert_eq!(o.len(), 1);
        assert_eq!(o[0]["damage"], 22);
        args["annotation"] = o[0]["annotation"].clone();
        let e = b.apply(&args).unwrap();
        assert_eq!(b.hull, [60, 38]);
        assert_eq!(e["sweep"], true);
        assert_eq!(b.state.opponent.suipi_count, 1);
    }
    #[test]
    fn rival_can_hijack_your_build() {
        let mut b = Battle::new(Some([0; 32]));
        let mut args = json!({"hand":0,"floor":[1],"kind":"build"});
        let o = b.options(&args);
        assert_eq!(o.len(), 1);
        args["annotation"] = o[0]["annotation"].clone();
        b.apply(&args).unwrap();
        assert_eq!(b.hull, [60, 60]);
        let m = b.best_move().unwrap();
        let event = b.apply(&m).unwrap();
        assert_eq!(event["kind"], "capture");
        assert_eq!(event["value"], 7);
        assert_eq!(b.hull[0], 46);
    }
    #[test]
    fn invalid_action_does_not_change_state() {
        let mut b = Battle::new(Some([0; 32]));
        let before = b.snapshot();
        assert!(b
            .play(&json!({"hand":0,"floor":[1],"kind":"capture","annotation":"*B&1"}))
            .is_err());
        assert_eq!(before, b.snapshot());
    }
    #[test]
    fn battles_finish_and_replay_with_conserved_cards() {
        for seed in 0..16 {
            let mut b = Battle::new(Some([seed; 32]));
            let mut player_turns = 0;
            while !b.finished() {
                let count = b.state.deck.len()
                    + b.state.opponent.card_count()
                    + b.state.dealer.card_count()
                    + b.state.opponent.into_pair_cards().len()
                    + b.state.dealer.into_pair_cards().len()
                    + b.state.floor.iter().map(|p| p.cards.len()).sum::<usize>();
                assert_eq!(count, 24);
                let args = b.best_move().unwrap();
                b.play(&args).unwrap();
                player_turns += 1;
                assert!(player_turns <= 24);
            }
            let mut replay = Battle::new(Some(b.seed));
            for m in &b.history {
                replay.play(m).unwrap();
            }
            assert_eq!(replay.snapshot(), b.snapshot());
        }
    }
}
