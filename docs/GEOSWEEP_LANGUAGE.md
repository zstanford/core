# GeoSweep language

GeoSweep is a neon geometric strategy game about fusing shapes, capturing points, and contesting a shared field. The project name is **GeoSweep**. Use it in titles, loading screens, menus, and metadata.

| Concept | Player-facing term |
| --- | --- |
| Playable piece | Shape |
| Number from 1 to 13 | Value |
| Persistent color identity | Color family; color in ordinary instructions |
| Shared play area | Field |
| Available shapes | Hand |
| Combined shapes | Formation |
| Combine shapes | Fuse |
| Take equal values or sums | Capture |
| Leave a shape without capturing | Place |
| Group equal-value combinations | Stack |
| Formation that cannot be raised | Locked formation |
| Matching shape retained in hand | Finisher |
| Clear the entire field | Sweep; Sweep bonus when scoring |
| Shared point-lead indicator | Battle line |
| Scoring overview | Scoreboard |
| Pending action | Move preview |
| Cancel a preview | Undo |
| Restore a completed turn | Rewind |

Example instructions:

- Fuse a 5 and a 6 into an 11. Keep an 11 in your hand as the finisher.
- Capture matching values or combinations that add up to your shape's value.
- Clear the field for a Sweep bonus.
- Capture points to pull the battle line toward your side.

Do not use Suipi, cards, suits, energy, arsenal, forge, deploy, or Scorebook in the GeoSweep gameplay interface. Original engine attribution belongs in Credits. Camera rotation may still be called orbiting in technical documentation.

Astra and Sentinel remain the current player labels. Individual shape names are unchanged pending a separate geometry naming pass; formal geometry descriptions remain in the Field guide.

Internal Rust/WASM protocol terms (`build`, `discard`, `suit`) and existing storage keys remain compatible with saved matches. Do not rename protocol fields or storage keys as part of a copy change. The legacy card prototype is separate from GeoSweep's navigation.
