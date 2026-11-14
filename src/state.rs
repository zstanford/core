// Modified for Orbit: opt-in numeric build limits; classic apply behavior is unchanged.
use crate::action::{Address, Move, MoveError, Operation};
use crate::card::{Card, Suit, Value};
use crate::pile::{Mark, Pile, PileError};
use crate::rng::{ChaCha20Rng, SliceRandom};
use std::collections::{HashSet, VecDeque};
use std::fmt;

/// State manipulation errors
#[derive(Debug, Eq, PartialEq)]
pub enum StateError {
    InvalidAddress,
    InvalidDiscard,
    InvalidInput,
    InvalidMove(MoveError),
    InvalidPile(PileError),
    FloorIsFull,
    PileIsNotEmpty,
    OrphanedPile,
    OwnTooManyPiles,
    UnpairablePileValue,
    DuplicateFloorValue,
}

impl From<MoveError> for StateError {
    fn from(value: MoveError) -> StateError {
        StateError::InvalidMove(value)
    }
}

impl From<PileError> for StateError {
    fn from(value: PileError) -> StateError {
        StateError::InvalidPile(value)
    }
}

impl fmt::Display for StateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "State Error: {}",
            match self {
                StateError::InvalidAddress => "Invalid address".to_string(),
                StateError::InvalidDiscard => "Invalid discard".to_string(),
                StateError::InvalidInput => "Invalid input".to_string(),
                StateError::InvalidMove(e) => format!("Invalid move - {}", e),
                StateError::InvalidPile(e) => format!("Invalid pile - {}", e),
                StateError::FloorIsFull => "Floor is full".to_string(),
                StateError::PileIsNotEmpty => "Pile is not empty".to_string(),
                StateError::OrphanedPile => "You may not abandon your own pile".to_string(),
                StateError::OwnTooManyPiles => "Owning too may piles".to_string(),
                StateError::UnpairablePileValue => "Un-pairable pile value".to_string(),
                StateError::DuplicateFloorValue => "Duplicate floor card".to_string(),
            }
        )
    }
}

/// The state of a player
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Player {
    pub hand: Vec<Pile>,
    pub pairs: Vec<Pile>,
    pub suipi_count: u8,
}

impl Player {
    /// Get a new player from 8 piles
    pub fn new(hand: Vec<Pile>) -> Player {
        Player {
            hand,
            pairs: vec![],
            suipi_count: 0,
        }
    }

    /// Get the number of cards in a player's hand
    pub fn card_count(&self) -> usize {
        self.hand.iter().filter(|x| !x.is_empty()).count()
    }

    /// Get all the cards collected in pairs
    pub fn into_pair_cards(&self) -> Vec<Card> {
        self.pairs.iter().flat_map(|p| p.cards.to_vec()).collect()
    }
}

/// The state of a game
#[derive(Clone, Debug, Default)]
pub struct State {
    pub deck: VecDeque<Card>,
    pub floor: Vec<Pile>,
    pub dealer: Player,
    pub opponent: Player,
    pub turn: bool,
    pub last_score: bool,
}

impl State {
    /// Initialize the deck with all 52 cards
    pub fn init_deck(&mut self) {
        for i in 0..52 {
            self.deck.push_back(Card::from(i));
        }
    }

    /// Shuffle the deck using the given RNG
    pub fn shuffle_deck(&mut self, rng: &mut ChaCha20Rng) {
        self.deck.make_contiguous().shuffle(rng);
    }

    /// Deal a single card from the deck
    pub fn deal_pile(&mut self) -> Pile {
        match self.deck.pop_front() {
            None => Pile::empty(),
            Some(card) => Pile::single(card),
        }
    }

    /// Deal eight cards to each player
    pub fn deal_hands(&mut self) {
        self.opponent.hand = vec![];
        self.dealer.hand = vec![];
        for _ in 0..8 {
            let a = self.deal_pile();
            let b = self.deal_pile();
            self.opponent.hand.push(a);
            self.dealer.hand.push(b);
        }
    }

    /// Check if the floor contains only unique values
    pub fn unique_floor(&self) -> bool {
        let mut unique = HashSet::new();
        self.floor
            .iter()
            .filter(|x| !x.is_empty())
            .map(|x| x.value)
            .all(|v| unique.insert(v))
    }

    /// Verify that point cards are not dealt to the floor
    pub fn valid_floor(&self) -> bool {
        self.floor.iter().flat_map(|p| &p.cards).all(|c| {
            (c.value != Value::Ace as u8)
                && !((c.suit == Suit::Diamonds as u8 && c.value == Value::Ten as u8)
                    || (c.suit == Suit::Spades as u8 && c.value == Value::Two as u8))
        })
    }

    /// Deal four unique cards to the floor
    pub fn deal_floor(&mut self) {
        self.floor = vec![];
        self.collapse_floor();
        for i in 0..4 {
            while self.floor[i].is_empty() {
                let x = self.deal_pile();
                self.floor[i].replace(x);
                if !self.unique_floor() || !self.valid_floor() {
                    for c in self.floor[i].take().cards.iter().copied() {
                        self.deck.push_back(c);
                    }
                }
            }
        }
    }

    /// Collapse all piles to the beginning of the floor array
    fn collapse_floor(&mut self) {
        self.floor.retain(|x| !x.is_empty());
        while self.floor.len() < 13 {
            self.floor.push(Pile::empty());
        }
    }

    /// Award remaining floor cards to the last scorer at the end of the game
    pub fn pickup_floor(&mut self) {
        let cards = self
            .floor
            .iter()
            .filter(|x| !x.is_empty())
            .flat_map(|x| x.cards.clone())
            .collect::<Vec<Card>>();
        let last_pair = Pile::new(cards, Value::Invalid as u8, Mark::Pair);
        if self.last_score {
            self.dealer.pairs.push(last_pair);
        } else {
            self.opponent.pairs.push(last_pair);
        }
    }

    /// Get the number of piles on the floor
    pub fn floor_count(&self) -> usize {
        self.floor.iter().filter(|x| !x.is_empty()).count()
    }

    /// Get a reference to the player for the current turn
    pub fn player(&self) -> &Player {
        if self.turn {
            &self.dealer
        } else {
            &self.opponent
        }
    }

    /// Get a mutable reference to the player for the current turn
    pub fn player_mut(&mut self) -> &mut Player {
        if self.turn {
            &mut self.dealer
        } else {
            &mut self.opponent
        }
    }

    /// Get the context needed to access the given address
    pub fn pile(&self, a: Address) -> (&Vec<Pile>, usize) {
        match a {
            Address::Hand(i) => (&self.player().hand, i as usize),
            Address::Floor(j) => (&self.floor, j as usize),
        }
    }

    /// Get the mutable context needed to access the given address
    pub fn pile_mut(&mut self, a: Address) -> (&mut Vec<Pile>, usize) {
        match a {
            Address::Hand(i) => (&mut self.player_mut().hand, i as usize),
            Address::Floor(j) => (&mut self.floor, j as usize),
        }
    }

    /// Take the value out of a pile if it is not empty
    pub fn take(&mut self, a: Address) -> Option<Pile> {
        let (piles, i) = self.pile_mut(a);
        if !piles[i].is_empty() {
            Some(piles[i].take())
        } else {
            None
        }
    }

    /// Replace the value of an empty pile
    pub fn replace(&mut self, a: Address, p: Pile) -> Result<(), StateError> {
        let (piles, i) = self.pile_mut(a);
        if piles[i].is_empty() {
            piles[i].replace(p);
            Ok(())
        } else {
            Err(StateError::PileIsNotEmpty)
        }
    }

    /// Discard a card from your hand
    pub fn discard(&mut self, a: Address) -> Result<(), StateError> {
        if self.stacks() != 0 {
            Err(StateError::InvalidDiscard)
        } else {
            match a {
                Address::Hand(_) => {
                    if let Some(pile) = self.take(a) {
                        if let Some(j) = self.floor.iter().position(|x| x.is_empty()) {
                            self.floor[j].replace(pile);
                            if self.unique_floor() {
                                Ok(())
                            } else {
                                let v = self.floor[j].take();
                                self.replace(a, v)?;
                                Err(StateError::InvalidDiscard)
                            }
                        } else {
                            self.replace(a, pile)?;
                            Err(StateError::FloorIsFull)
                        }
                    } else {
                        Err(StateError::InvalidDiscard)
                    }
                }
                _ => Err(StateError::InvalidAddress),
            }
        }
    }

    /// Attempt to combine the cards from two piles
    pub fn combine<F, G>(
        &mut self,
        reduce: F,
        save: G,
        p: (Address, Address),
    ) -> Result<(), StateError>
    where
        F: FnOnce(&mut Pile, &mut Pile) -> Result<Pile, PileError>,
        G: FnOnce(&mut Self, Pile) -> Result<(), StateError>,
    {
        if let (Some(mut x), Some(mut y)) = (self.take(p.0), self.take(p.1)) {
            match reduce(&mut x, &mut y) {
                Ok(mut z) => {
                    z.owner = self.turn;
                    save(self, z)
                }
                Err(e) => {
                    let (xs, i) = self.pile_mut(p.0);
                    xs[i].replace(x);
                    let (ys, i) = self.pile_mut(p.1);
                    ys[i].replace(y);
                    Err(e.into())
                }
            }
        } else {
            Err(StateError::InvalidAddress)
        }
    }

    /// Build a pile from two addresses
    pub fn build(&mut self, a: Address, b: Address) -> Result<(), StateError> {
        self.combine(Pile::build, |g, z| g.replace(a, z), (a, b))
    }

    /// Group two piles from two addresses
    pub fn group(&mut self, a: Address, b: Address) -> Result<(), StateError> {
        self.combine(Pile::group, |g, z| g.replace(a, z), (a, b))
    }

    /// Pair a pile with a capturing card
    pub fn pair(&mut self, a: Address, b: Address) -> Result<(), StateError> {
        let res = self.combine(
            Pile::pair,
            |g, z| {
                g.player_mut().pairs.push(z);
                Ok(())
            },
            (a, b),
        );
        if res.is_ok() {
            self.last_score = self.turn;
        }
        res
    }

    /// Count the number of stacked piles owned by the current player
    pub fn stacks(&self) -> usize {
        self.floor
            .iter()
            .filter(|x| x.cards.len() > 1 && x.owner == self.turn)
            .count()
    }

    /// Make sure a turn results in a valid game state
    pub fn validate_turn(&self, destination: Address, pair: bool) -> Result<(), StateError> {
        let (piles, i) = self.pile(destination);
        if self.stacks() > 1 {
            Err(StateError::OwnTooManyPiles)
        } else if !pair && !self.player().hand.iter().any(|x| x.value == piles[i].value) {
            Err(StateError::UnpairablePileValue)
        } else if self
            .floor
            .iter()
            .filter(|x| x.cards.len() > 1 && x.owner == self.turn)
            .any(|x| self.player().hand.iter().all(|y| y.value != x.value))
        {
            Err(StateError::OrphanedPile)
        } else if !self.unique_floor() {
            Err(StateError::DuplicateFloorValue)
        } else {
            Ok(())
        }
    }

    /// Apply a move to the game state
    pub fn apply(&mut self, m: Move) -> Result<(), StateError> {
        self.apply_with_limit(m, 10)
    }

    /// Apply a move with a numeric build ceiling chosen by the game adapter.
    pub fn apply_with_limit(&mut self, m: Move, limit: u8) -> Result<(), StateError> {
        m.is_valid()?;
        let mut builds = vec![];
        for w in m.actions.windows(2).rev() {
            match w[1].operation {
                Operation::Passive => {
                    builds.push(w[1].address);
                }
                Operation::Active => {
                    self.combine(
                        |x, y| Pile::build_with_limit(x, y, limit),
                        |g, z| g.replace(w[0].address, z),
                        (w[0].address, w[1].address),
                    )?;
                }
            }
        }
        let destination = m.actions[0].address;
        let pair = m.actions[0].operation == Operation::Active;
        for (i, b) in builds.iter().rev().enumerate() {
            if i == builds.len() - 1 && pair {
                self.pair(destination, b.to_owned())?;
            } else {
                self.group(destination, b.to_owned())?;
            }
        }
        if let Address::Hand(_) = destination {
            if !pair {
                self.collapse_floor();
                self.discard(destination)?;
            }
        }
        self.validate_turn(destination, pair)?;
        self.collapse_floor();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::action::{Action, Address, Operation};
    use crate::card::{Suit, Value};
    use crate::pile::Mark;
    use crate::rng::Rng;

    /// Setup an initial game state
    fn setup() -> State {
        let mut rng = Rng::from_seed([0; 32]);
        let mut g = State::default();
        g.init_deck();
        g.shuffle_deck(rng.rng_borrow_mut());
        g.deal_hands();
        g.deal_floor();
        g
    }

    /// Helper for populating a pile with a pair
    fn pair(xs: Vec<Card>, v: Value) -> Pile {
        Pile::new(xs, v as u8, Mark::Pair)
    }

    /// Helper for populating a pile with a group
    fn group(xs: Vec<Card>, v: Value) -> Pile {
        Pile::new(xs, v as u8, Mark::Group)
    }

    /// Helper for populating a pile with a build
    fn build(xs: Vec<Card>, v: Value) -> Pile {
        Pile::new(xs, v as u8, Mark::Build)
    }

    /// Helper for populating a pile with a single
    fn single(v: Value, s: Suit) -> Pile {
        Pile::single(Card::create(v, s))
    }

    /// Helper for getting an empty pile
    fn empty() -> Pile {
        Pile::empty()
    }

    #[test]
    fn test_state_setup() {
        let g = setup();

        assert_eq!(
            g.opponent,
            Player::new(vec![
                single(Value::Ace, Suit::Hearts),
                single(Value::King, Suit::Clubs),
                single(Value::Two, Suit::Diamonds),
                single(Value::Ace, Suit::Clubs),
                single(Value::Seven, Suit::Clubs),
                single(Value::Eight, Suit::Spades),
                single(Value::King, Suit::Hearts),
                single(Value::Three, Suit::Spades),
            ])
        );

        assert_eq!(
            g.dealer,
            Player::new(vec![
                single(Value::Ten, Suit::Diamonds),
                single(Value::Four, Suit::Hearts),
                single(Value::Ten, Suit::Spades),
                single(Value::Five, Suit::Spades),
                single(Value::Three, Suit::Diamonds),
                single(Value::Five, Suit::Clubs),
                single(Value::Six, Suit::Spades),
                single(Value::Jack, Suit::Hearts),
            ])
        );

        assert_eq!(
            g.floor,
            [
                single(Value::Four, Suit::Clubs),
                single(Value::Seven, Suit::Diamonds),
                single(Value::Two, Suit::Hearts),
                single(Value::Eight, Suit::Clubs),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty()
            ]
        );
    }

    #[test]
    fn test_apply_move() {
        let mut g = setup();

        assert!(g
            .apply(Move::new(vec![
                Action::new(Operation::Active, Address::Floor(2)),
                Action::new(Operation::Passive, Address::Hand(2)),
            ]))
            .is_ok());

        assert_eq!(
            g.opponent.hand,
            [
                single(Value::Ace, Suit::Hearts),
                single(Value::King, Suit::Clubs),
                empty(),
                single(Value::Ace, Suit::Clubs),
                single(Value::Seven, Suit::Clubs),
                single(Value::Eight, Suit::Spades),
                single(Value::King, Suit::Hearts),
                single(Value::Three, Suit::Spades),
            ]
        );

        assert_eq!(
            g.floor,
            [
                single(Value::Four, Suit::Clubs),
                single(Value::Seven, Suit::Diamonds),
                single(Value::Eight, Suit::Clubs),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty()
            ]
        );

        assert_eq!(
            g.opponent.pairs,
            vec![pair(
                vec![
                    Card::create(Value::Two, Suit::Hearts),
                    Card::create(Value::Two, Suit::Diamonds),
                ],
                Value::Two
            )]
        );
    }

    #[test]
    fn test_build_method() {
        let mut g = setup();

        assert!(g.build(Address::Floor(0), Address::Floor(2)).is_ok());

        assert_eq!(
            g.floor,
            [
                build(
                    vec![
                        Card::create(Value::Four, Suit::Clubs),
                        Card::create(Value::Two, Suit::Hearts),
                    ],
                    Value::Six
                ),
                single(Value::Seven, Suit::Diamonds),
                empty(),
                single(Value::Eight, Suit::Clubs),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty()
            ]
        );
    }

    #[test]
    fn test_group_method() {
        let mut g = setup();

        assert!(g.build(Address::Floor(0), Address::Hand(7)).is_ok());
        assert!(g.group(Address::Floor(0), Address::Floor(1)).is_ok());

        assert_eq!(
            g.floor,
            [
                group(
                    vec![
                        Card::create(Value::Four, Suit::Clubs),
                        Card::create(Value::Three, Suit::Spades),
                        Card::create(Value::Seven, Suit::Diamonds),
                    ],
                    Value::Seven
                ),
                empty(),
                single(Value::Two, Suit::Hearts),
                single(Value::Eight, Suit::Clubs),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty()
            ]
        );
    }

    #[test]
    fn test_pair_method() {
        let mut g = setup();

        assert!(g.build(Address::Floor(0), Address::Hand(7)).is_ok());
        assert!(g.group(Address::Floor(0), Address::Floor(1)).is_ok());
        assert!(g.pair(Address::Floor(0), Address::Hand(4)).is_ok());

        assert_eq!(
            g.floor,
            [
                empty(),
                empty(),
                single(Value::Two, Suit::Hearts),
                single(Value::Eight, Suit::Clubs),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty()
            ]
        );

        assert_eq!(
            g.opponent.pairs,
            vec![pair(
                vec![
                    Card::create(Value::Four, Suit::Clubs),
                    Card::create(Value::Three, Suit::Spades),
                    Card::create(Value::Seven, Suit::Diamonds),
                    Card::create(Value::Seven, Suit::Clubs),
                ],
                Value::Seven
            )]
        );
    }

    #[test]
    fn test_discard_method() {
        let mut g = setup();

        assert!(g.discard(Address::Hand(0)).is_ok());

        assert_eq!(
            g.opponent,
            Player::new(vec![
                empty(),
                single(Value::King, Suit::Clubs),
                single(Value::Two, Suit::Diamonds),
                single(Value::Ace, Suit::Clubs),
                single(Value::Seven, Suit::Clubs),
                single(Value::Eight, Suit::Spades),
                single(Value::King, Suit::Hearts),
                single(Value::Three, Suit::Spades),
            ])
        );

        assert_eq!(
            g.floor,
            [
                single(Value::Four, Suit::Clubs),
                single(Value::Seven, Suit::Diamonds),
                single(Value::Two, Suit::Hearts),
                single(Value::Eight, Suit::Clubs),
                single(Value::Ace, Suit::Hearts),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty(),
                empty()
            ]
        );
    }
}
