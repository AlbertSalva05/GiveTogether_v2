# Image slots

Drop real photography here using these exact filenames. JPG, 1600px on the long edge, under 250 KB.
Until a file exists, each slot renders the hatched placeholder with its filename printed on it.

| File | Where it shows | Suggested crop |
| --- | --- | --- |
| img_hero_01.jpg | Discover hero | 16:9, subject on the right third |
| img_og_01.jpg | Social share preview | 1200 × 630 |
| img_campaign_01.jpg | Nanay Rosa — card, campaign hero, receipt | 16:10 |
| img_campaign_02.jpg | Baby Liam | 16:10 |
| img_campaign_03.jpg | Marikina school supplies | 16:10 |
| img_campaign_04.jpg | Bagong Silang water tanks | 16:10 |
| img_campaign_05.jpg | Bantayan fishing bancas | 16:10 |
| img_campaign_06.jpg | Davao scholarships | 16:10 |

To switch a slot from placeholder to photo, replace the `.media` block's `<span class="media_filename">`
with `<img src="assets/img/img_campaign_01.jpg" alt="…" loading="lazy" width="1600" height="1000">`
(the renderer in `assets/js/app.js → media()` is the single place to change).
