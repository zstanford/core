use rand::random;
pub use rand::seq::SliceRandom;
pub use rand::SeedableRng;
pub use rand_chacha::ChaCha20Rng;
use std::default::Default;

/// Suipi RNG seed
pub type Seed = [u8; 32];

/// Suipi game random number generator
pub struct Rng(ChaCha20Rng);

impl Rng {
    /// Get Suipi game RNG from a 256 bit seed
    pub fn from_seed(seed: Seed) -> Self {
        Rng(ChaCha20Rng::from_seed(seed))
    }

    /// Get Suipi game RNG from a random seed
    pub fn random() -> Self {
        Rng::from_seed(random())
    }

    /// Get a reference to the base RNG object
    pub fn rng_borrow(&self) -> &ChaCha20Rng {
        &self.0
    }

    /// Get mutable reference to base RNG object
    pub fn rng_borrow_mut(&mut self) -> &mut ChaCha20Rng {
        &mut self.0
    }
}

impl Default for Rng {
    fn default() -> Self {
        Rng::random()
    }
}
