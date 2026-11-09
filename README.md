# Midnight Paws Boba

A cozy lo-fi cat boba café you play in the browser. You take orders from cats, make boba drinks in first person (3D), earn tips and XP, unlock new flavors, shop for furniture and outfits, decorate your café, invent drinks in a lab, and rebirth for a permanent tip bonus.

Made by Kaylyn Hostetler (vibe coded with Claude).

## How to play it

[Play Midnight Paws Boba](https://tigerplaysgames.github.io/midnight-paws-boba/). Open the link and create your cat. On a touchscreen, use the arrow pad to walk, drag the scene to look, and tap the station prompt.

Your character, tips, XP, unlocks and notebook save automatically in this browser. Return to the same address on the same browser and device to continue. Continue shift restores the waiting customer, ingredient quantities, shake progress and separate café and lab cups. Use **Save backups → Download save** to keep a portable copy. Open **Save backups → Restore from file** in another browser or on another device to continue there. Clearing site data or ending a private browsing session can erase progress.

After the menu says **Ready to play offline**, you can reopen the same link without internet. The game bundles Three.js r128 and uses system fonts if Google Fonts are unavailable.

To run locally, serve the repository with `python -m http.server 8000` and open `http://localhost:8000/`. GitHub Pages serves the root of `main`. When changing the game files, bump the cache version in `sw.js` so returning players receive the update after closing old tabs.

### Midnight Market

Choose **Midnight Market · Cooking & Crew** on the main menu, or use [the update and play link](https://tigerplaysgames.github.io/midnight-paws-boba/play.html) in your current game tab. It checks the offline build and opens the market using the same browser save. Noren Noodle Bar opens free. Use earnings from either the café or your restaurants to open the other five kitchens. Each restaurant has three dishes, its own equipment, three upgrade paths and a one-time $20 bonus for serving its entire menu.

Choose Cozy Service for a single guest, Dinner Rush for a 65-second queue, or a six-meal Catering Contract for a $35 bonus. Select a ticket, prep, cook, choose its finishing ingredient and serve. After warm-up, the ticket opens a hands-on station. Drain udon, stir rice cakes clockwise, layer a bánh mì, toss and catch pad thai, flip and lift a dosa, or measure water and vent the rice steamer. Completing the station earns an extra $2 on service. Each station supports touch, mouse and keyboard controls. A second cooktop lets you work on two tickets in parallel. Pause Shift freezes the clock. Resume from the same restaurant, including after an offline reload or a save-file transfer.

The **Kitchen crew** board unlocks Pip the prep cook after 2 meals, Yuzu the server after 5 and Miso the sous-chef after 10 at that restaurant. Each hire costs in-game money and can train twice after reaching additional sales milestones. Staff prep tickets, garnish dishes and deliver plated meals during active service. You handle the cooking. Shift backups include crew levels and ticket progress.

The painted counter works with mouse, keyboard and touch. **Switch to first person** opens a 3D kitchen on WebGL-capable devices. Drag to look, press A/D to move along the counter, or tap a station to move there and use it. The original boba café also cycles between first person, third person and a fixed counter using the view button or V.

| Restaurant | Menu focus |
|---|---|
| Noren Noodle Bar · Japan | Udon |
| Red Tent Kitchen · South Korea | Tteokbokki |
| Little Bánh Mì · Vietnam | Bánh mì |
| Lime & Wok · Thailand | Pad thai |
| Moonrise Tiffin · India | Dosa |
| Pandan Corner · Malaysia | Nasi lemak |

### Controls (café)
| Key | Action |
|---|---|
| W A S D / arrows | Walk |
| Drag the mouse | Look around |
| E | Use the station you're standing at |
| Hold E or 1–9 (0 for the 10th) | Pour or scoop |
| Space | Shake, then serve |
| N | Notes |
| V | First person / third person / fixed counter |
| Scroll | Zoom |
| Esc | Close a window |

## Features

- **Orders:** a cat sits at the counter and you press Take order. The cat speaks the order with typing blips. Open Notes for a free ingredient checklist and room for handwritten notes.
- **First-person 3D counter:** stations run left to right: cups, ice, tea, milk, syrup, powder, toppings, shaker, serve. Dispenser handles press, pumps push, scoops move and the shaker shakes.
- **Procedural sounds (Web Audio):** ice clicking in a plastic cup, a tea splish, a milk pour that rises in pitch, a syrup drizzle, a powder puff, sticky boba, ice rattling in the shaker, and a sound on every button.
- **Music:** rotating lo-fi tracks in the café and rotating jazz tunes in the shops. Day and night switch every 5 minutes, and sound settings toggle all sound, music, rain and SFX separately.
- **Progression:** tips, XP, levels, a combo multiplier, collectable goals (finished goals wait for you to press Collect), a daily gift, a cat album with rare cats, and Rebirth (Lv 10, +25% tips on perfect drinks per rebirth).
- **Unlocks:**
  - Lv 5: Customize Café, Paws & Co. Home and Whisker Wear
  - Lv 7: Drink Lab
  - Lv 10: Rebirth
- **Shops:** a 2D night-time map (Whisker Lane) leads to three walk-in 3D shops. Unowned items glow, and walking close shows a Buy button.
  - **Boba Supply Co.:** drink kits grouped as Tea & Milk, Syrups & Fruit and Powders; topping jars; Grumbles the grumpy cashier you can talk to; jazz.
  - **Paws & Co. Home:** showroom room sets for Living room, Dining, Plants, Study & music and Cat corner.
  - **Whisker Wear:** hats and accessories in lit arches, and a fitting room where your own cat models the outfit.
- **Customize Café:** walk in and place furniture, then rotate, move or trash it. Sofas, armchairs and rugs can be recolored. There's also a bird's-eye view.
- **Your cat:** name, fur, accessory and apron. Clothes bought at Whisker Wear show up here.
- **Drink Lab:** invent drinks in a science-lab room with a Hall of Creations display case.
- **Other:** a first-time tutorial with arrows, a guidebook, tips, background cats (chatting, on a laptop, wandering in), and a sleeping cat on the windowsill.

## How the code is organized (read this before editing)

`index.html` is about 5,400 lines: HTML, then CSS (`<style>`), then one big `<script>` wrapped in an IIFE.

The game was built in layers. Each later layer is pasted below the earlier ones, just above the `/* ---------- Boot ---------- */` line near the end of the file. Search for these headers:

```
/* ================= v10: café loop ================= */
/* ================= v16: goals wait to be collected ================= */
```

**Important rules for that layering:**

1. **Later `function` declarations replace earlier ones with the same name.** They're all hoisted inside one IIFE, so the last one wins. For example, `buildShop`, `renderStations3`, `loopShop`, `mapSVG` and `ensureRig` exist several times, and only the **last** copy runs. Always edit the last one: search from the bottom of the file.
2. **Some functions are wrapped at runtime instead,** like `const _x = fn; fn = function(){ _x(); ... }`. Examples are `loopC3Body`, `renderMenuScreen`, `levelUp`, `startCafe`, `openShop`, `schedule`, `renderHUD` and `nope`. Each wrapper calls the previous one, so they chain together.
3. **Never declare a `const`/`let` name twice.** That's a syntax error.
4. After a change, check the script still parses. One way: copy the script into a `.js` file and run `node --check file.js`.

### Key objects

| Name | What it is |
|---|---|
| `S` | Saved state: money, level, xp, unlocked, goals, me (your cat), cafe3d (furniture), furn, wardrobe, creations, rebirths, tutDone… |
| `G` | Live game state: mode (`cafe`/`lab`/`decor`), current cat, phase, cup, station, day/night |
| `C3` | The 3D café: renderer, scene, camera, first-person rig/paws, stations, ambient cats, lab |
| `SH` | The 3D shops: renderer, camera, cached scenes per shop, keys |
| `M3` | The 3D menu background |
| `ING`, `DRINKS`, `TOPS` | Ingredient, drink and topping data |
| `STATIONS` | Counter stations and their x positions |
| `FURN`, `FURN3`, `FURN_PRICE` | Furniture data, 3D builders and prices |
| `WEAR` | Cat clothes and prices |
| `MAPSPOTS` | Shops on the 2D map (with unlock levels) |
| `TUT` | Tutorial steps |
| `SFX`, `pourSound`, `tone`, `noise` | Sound effects (Web Audio) |

### Main functions to know
- `renderStations3()`: builds the 3D counter equipment. `animStations()` moves handles, pumps and the shaker.
- `loopC3Body(now)`: the café render loop (camera, walking, prompts, cups, customer cat).
- `cupMesh3(cup)`: the 3D drink cup.
- `buildShop(kind)`: builds a shop interior (`market`, `furn`, `wear`). `loopShop()` is the shop loop.
- `buildItem3(type, color)`: builds a 3D furniture item.
- `mapSVG()`: draws the shop map.
- `serve()`, `completeGoal()`, `collectGoal()`, `levelUp()`, `gainXP()`: rewards.

### Testing without 3D
If Three.js can't load (offline), the game runs in a 2D fallback, so most menus and the order flow can still be tested.

## Ideas for next steps
- Split the file into modules (`audio.js`, `cafe3d.js`, `shops.js`, …) to make it easier to edit.
- Remove dead code from earlier layers, like the old town (`buildTown`), The Purr Lounge (`buildBar`) and Boba Catch.

### Restaurant artwork

The six WebP backgrounds in [assets/market](assets/market/) were extracted from one original atlas generated with the built-in image generation tool.

<details><summary>Art prompt</summary>

One landscape 3:2 game texture atlas, exactly three equal-width columns and two equal-height rows, edge-to-edge square tiles without gutters, no writing, no words, no letters. Six distinct inviting tiny cat-run restaurants at midnight. Illustrated hand-painted gouache with dark plum outlines, luminous windows, appetizing food, intricate cozy shop interiors, each viewed from the customer side looking over a wooden counter, friendly cat cook prominent. Top left: Japanese indigo noren udon shop with steaming noodle bowls. Top middle: Korean crimson tented tteokbokki stall with red sauce pans and rice cakes. Top right: Vietnamese mint-painted bánh mì bakery with baguettes and pickled vegetables. Bottom left: Bangkok teal pad thai wok stall with lime wedges. Bottom middle: South Indian ochre dosa tiffin counter with brass vessels and rolled golden dosas. Bottom right: Malaysian jade nasi lemak stall with banana leaves, coconut rice, sambal and egg. Distinct architecture, handmade tactile detail, nighttime city ambience. Fill each square with its own composition. No border, text, UI, watermark or labels.

</details>
