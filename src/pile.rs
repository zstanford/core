// Modified for Orbit: configurable build ceiling; classic play retains a ceiling of ten.
use crate::card::Card;
use std::fmt;

/// Pile manipulation errors
#[derive(Debug, Eq, PartialEq)]
pub enum PileError {
    InvalidBuildArg,
    InvalidGroupArg,
    InvalidPairArg,
    BuildEqualValues,
    BuildHigherThanTen,
    BuildAboveLimit(u8),
    GroupDifferentValues,
    GroupTwoSingles,
    PairDifferentValues,
}

impl fmt::Display for PileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            match self {
                PileError::InvalidBuildArg => "You may not build using a group",
                PileError::InvalidGroupArg => "You may not group using a pair",
                PileError::InvalidPairArg => "Invalid pair argument",
                PileError::BuildEqualValues => "You may not build two cards with the same value",
                PileError::BuildHigherThanTen => "You may not build a value larger than 10",
                PileError::BuildAboveLimit(_) => "Build exceeds the configured energy limit",
                PileError::GroupDifferentValues =>
                    "You may not group two cards with different values",
                PileError::GroupTwoSingles => "You may not group two individual cards together",
                PileError::PairDifferentValues =>
                    "You may not pair a card with a pile that has a different value",
            }
        )
    }
}

/// A pile type marker
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum Mark {
    #[default]
    Empty,
    Single,
    Build,
    Group,
    Pair,
}

/// A pile of cards
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Pile {
    pub cards: Vec<Card>,
    pub value: u8,
    pub mark: Mark,
    pub owner: bool,
}

impl Pile {
    /// Create a new pile
    pub fn new(cards: Vec<Card>, value: u8, mark: Mark) -> Self {
        Pile {
            cards,
            value,
            mark,
            owner: false,
        }
    }

    /// Create an empty pile
    pub fn empty() -> Self {
        Pile::default()
    }

    /// Create a single card pile
    pub fn single(card: Card) -> Self {
        Pile::new(vec![card], card.value, Mark::Single)
    }

    /// Create a card in a single card pile
    pub fn card(value: u8, suit: u8) -> Self {
        Pile::single(Card::new(value, suit))
    }

    /// Is this pile empty?
    pub fn is_empty(&self) -> bool {
        self.mark == Mark::Empty
    }

    // Is this pile a single?
    pub fn is_single(&self) -> bool {
        self.mark == Mark::Single
    }

    // Is this pile a build?
    pub fn is_build(&self) -> bool {
        self.mark == Mark::Build
    }

    // Is this pile a group?
    pub fn is_group(&self) -> bool {
        self.mark == Mark::Group
    }

    // Is this pile a pair?
    pub fn is_pair(&self) -> bool {
        self.mark == Mark::Pair
    }

    /// Replace the current pile with another
    pub fn replace(&mut self, p: Pile) -> Pile {
        let x = self.clone();
        self.cards = p.cards.clone();
        self.value = p.value;
        self.mark = p.mark;
        self.owner = p.owner;
        x
    }

    /// Take the current pile value away
    pub fn take(&mut self) -> Self {
        self.replace(Pile::empty())
    }

    /// Can I use this pile in a build?
    pub fn buildable(x: &Pile) -> Result<(), PileError> {
        if x.is_single() || x.is_build() {
            Ok(())
        } else {
            Err(PileError::InvalidBuildArg)
        }
    }

    /// Can I use this pile in a group?
    pub fn groupable(x: &Pile) -> Result<(), PileError> {
        if x.is_group() || x.is_build() || x.is_single() {
            Ok(())
        } else {
            Err(PileError::InvalidGroupArg)
        }
    }

    /// Can I pair this pile with another one?
    pub fn pairable(x: &Pile) -> Result<(), PileError> {
        if x.is_single() {
            Ok(())
        } else {
            Err(PileError::InvalidPairArg)
        }
    }

    /// Are both piles singles?
    pub fn both_singles(x: &Pile, y: &Pile) -> Result<(), PileError> {
        if x.is_single() && y.is_single() {
            Err(PileError::GroupTwoSingles)
        } else {
            Ok(())
        }
    }

    /// Combine the cards from two piles
    pub fn cards(x: &mut Pile, y: &mut Pile) -> Vec<Card> {
        let mut cards = vec![];
        cards.append(&mut x.cards);
        cards.append(&mut y.cards);
        cards
    }

    /// Create a build pile from two buildable piles
    pub fn build(x: &mut Pile, y: &mut Pile) -> Result<Pile, PileError> {
        Self::build_with_limit(x, y, 10)
    }

    /// Combine numeric piles using the supplied energy ceiling.
    pub fn build_with_limit(x: &mut Pile, y: &mut Pile, limit: u8) -> Result<Pile, PileError> {
        Pile::buildable(x)?;
        Pile::buildable(y)?;
        if x.cards
            .iter()
            .any(|xc| y.cards.iter().any(|yc| xc.value == yc.value))
        {
            Err(PileError::BuildEqualValues)
        } else if x.value + y.value > limit {
            Err(if limit == 10 {
                PileError::BuildHigherThanTen
            } else {
                PileError::BuildAboveLimit(limit)
            })
        } else {
            Ok(Pile::new(Pile::cards(x, y), x.value + y.value, Mark::Build))
        }
    }

    /// Create a group pile from two groupable piles
    pub fn group(x: &mut Pile, y: &mut Pile) -> Result<Pile, PileError> {
        Pile::groupable(x)?;
        Pile::groupable(y)?;
        Pile::both_singles(x, y)?;
        if x.value != y.value {
            Err(PileError::GroupDifferentValues)
        } else {
            Ok(Pile::new(Pile::cards(x, y), x.value, Mark::Group))
        }
    }

    /// Create a pair pile using a pairable pile
    pub fn pair(x: &mut Pile, y: &mut Pile) -> Result<Pile, PileError> {
        Pile::pairable(y)?;
        if x.value != y.value {
            Err(PileError::PairDifferentValues)
        } else {
            Ok(Pile::new(Pile::cards(x, y), x.value, Mark::Pair))
        }
    }
}

impl fmt::Display for Pile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.mark {
            Mark::Empty => write!(f, "___"),
            Mark::Single => write!(f, "{}", self.cards.first().unwrap()),
            Mark::Build => write!(f, "B{{{}}}", self.value),
            Mark::Group => write!(f, "G[{}]", self.value),
            Mark::Pair => write!(f, "P<{}>", self.value),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_and_group() {
        let mut x = Pile::card(2, 0);
        let mut y = Pile::card(3, 0);
        let z = Pile::build(&mut x, &mut y);
        assert_eq!(
            z,
            Ok(Pile::new(
                vec![Card::new(2, 0), Card::new(3, 0),],
                5,
                Mark::Build
            ))
        );
        let mut a = Pile::card(5, 0);
        let b = Pile::group(&mut z.unwrap(), &mut a);
        assert_eq!(
            b,
            Ok(Pile::new(
                vec![Card::new(2, 0), Card::new(3, 0), Card::new(5, 0),],
                5,
                Mark::Group
            ))
        );
    }

    #[test]
    fn test_build_piles_with_same_values() {
        let mut x = Pile::card(4, 0);
        let mut y = Pile::card(1, 0);
        let mut z = Pile::card(3, 0);
        let temp = Pile::build(&mut y, &mut z);
        let res = Pile::build(&mut x, &mut temp.unwrap());
        assert_eq!(
            res,
            Ok(Pile::new(
                vec![Card::new(4, 0), Card::new(1, 0), Card::new(3, 0)],
                8,
                Mark::Build
            ))
        );
    }

    #[test]
    fn test_build_cards_with_same_values() {
        let mut x = Pile::card(3, 0);
        let mut y = Pile::card(2, 0);
        let mut z = Pile::card(2, 1);
        let temp = Pile::build(&mut y, &mut z);
        assert_eq!(temp, Err(PileError::BuildEqualValues));
        // Separate like values
        let temp2 = Pile::build(&mut x, &mut y);
        let res = Pile::build(&mut z, &mut temp2.unwrap());
        assert_eq!(res, Err(PileError::BuildEqualValues));
    }

    #[test]
    fn test_errors() {
        let mut x = Pile::card(6, 0);
        let mut y = Pile::card(7, 0);
        let z = Pile::build(&mut x, &mut y);
        assert_eq!(z, Err(PileError::BuildHigherThanTen));
        let mut a = Pile::card(1, 0);
        let mut b = Pile::card(1, 1);
        let c = Pile::group(&mut a, &mut b);
        assert_eq!(c, Err(PileError::GroupTwoSingles));
    }
}
