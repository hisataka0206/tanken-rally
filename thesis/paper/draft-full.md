# [[論文フルドラフト]] v1（英語本文 ＋ 日本語要約）

作成日: 2026-07-18 ／ 骨子: `paper/draft-outline.md`
**取り扱い注意**: これは叩き台です。投稿前に著者が全文を検証し、自分の言葉として責任を持てる状態にしてください（[[arXiv]]は未確認のAI生成コンテンツを処分対象としています）。
**引用について**: 事実でない参考文献は書いていません。要出典箇所は `[TODO-CITE: ...]` で明示してあるので、著者が実在文献で埋めてください。

---

# 日本語要約（レビュー用・本文には含めない）

**主張の一本線**: 生成AIのキャラクリの弱点は「絵が下手」ではなく、**アイデンティティを"形"に載せられない**こと。それは測定でき、プロンプト介入で改善できる。

- **Study 1（比較）**: 人手設計ロスターは"格"を形で符号化（輪郭 1.55→3.19、ソリディティ 0.81→0.54、対称性 0.70→0.38）。色数は役割間でほぼ一定（43.9〜47.8）。対してAI出力は形が最も単純（輪郭1.44・ソリディティ0.87）なのに色数は最大（48.7）＝**間違った次元で複雑**。しかも個体間で指標が密集＝**格の階段が無い**。
- **Study 2（介入）**: 骨格タクソノミ（14）＋シルエットに出る特徴を明示。A/Bで平均輪郭 1.75→2.21、**個体間分散σ 0.39→0.50**。同一骨格内では突出する特徴（耳+0.24 / 角+0.16 / 冠羽+0.13）が効き、翼(+0.03)は丸胴では効かない＝**骨格と特徴に相性**。
- **失敗モード**: レア度に付属肢を結合すると骨格指定を上書きする（3回再現）。除去後は最高レア度でも骨格が保持。
- **副次的発見**: 否定非対応モデルでは不要物を名指しすると逆に描かれる（negation backfire）。
- **限界**: 単一モデル・小N・**人間知覚実験は未実施**（Future work）。再現用にコードと実験ハーネスを公開。

---

# English Full Draft

## Title

**Silhouette-First: Diagnosing and Repairing Identity Collapse in Text-to-Image Character Design**

*(Alternative: Shape, Not Color: Measuring Why Generative Character Design Collapses to Blobs)*

## Authors

Hisataka Yuasa¹ [TODO: affiliation / co-authors]
¹ [TODO: affiliation]

---

## Abstract

Text-to-image models make it cheap to mass-produce game mascots, yet practitioners frequently report that the results "look low quality" without being able to say why. We operationalize this complaint. Using a set of lightweight, reproducible shape descriptors — contour complexity, solidity, and bilateral symmetry, computed from binarized silhouettes — we compare a large human-designed creature roster (N=1025 silhouettes; 151 official illustrations with role labels) against characters produced by a deployed text-to-image pipeline.

We report three findings. First, in the human-designed roster, a character's narrative *rank* is encoded almost entirely in **shape**: contour complexity rises monotonically across role tiers (1.55 → 3.19) while solidity (0.81 → 0.54) and symmetry (0.70 → 0.38) fall, whereas effective color count stays essentially flat across tiers (43.9–47.8). Second, our generated characters occupy the opposite corner of this space: their silhouettes are *simpler* than the simplest human-designed tier (contour 1.44, solidity 0.87) while their surface complexity is the highest in the sample (48.7 effective colors). Complexity is being spent in the wrong dimension. Third, generated characters cluster tightly on all shape metrics, i.e. there is no rank ladder, and their identity rests on color and marking — so they become mutually indistinguishable once reduced to black silhouettes.

We then introduce **form-first prompting**: an explicit body-plan taxonomy (14 skeletons, derived by clustering the reference roster's silhouettes) combined with a mandated silhouette-visible feature, with surface color demoted to flavor. In a controlled A/B, adding the taxonomy raises mean contour complexity from 1.75 to 2.21 and, more importantly, raises between-character variance (σ 0.39 → 0.50), i.e. characters become *different from each other*. Single-axis sweeps show that body plan alone separates structurally extreme skeletons but not compact ones, while silhouette-visible features differentiate individuals within a shared skeleton — the two mechanisms are complementary. We further identify and repair a failure mode in which coupling rarity to appendage injection silently overrides the requested body plan, and we report a *negation backfire* effect: on models without a separate negative-prompt channel, naming unwanted content induces it. We release our metric implementation and experiment harness.

**Keywords:** procedural content generation, character design, text-to-image, silhouette readability, prompt engineering, game AI

---

## 1. Introduction

Generative image models have made it economically feasible to produce game assets — in particular collectible characters — at a volume that would previously have required a large art team. In deployed systems, however, a recurring practitioner complaint is that generated characters feel lower quality than hand-designed ones, even when each individual image is technically clean: correct anatomy, pleasant colors, no obvious artifacts. The complaint is real but rarely actionable, because "quality" is not measured.

This paper starts from a concrete production setting. We operate a children's neighborhood-exploration web application in which walking a route generates a mascot character as a reward. The application has downstream requirements that make this question unusually sharp: generated characters must survive being drawn as line art in a comic strip, being modeled as simple 3D shapes, and being printed as single-color merchandise silhouettes. Under these constraints, **identity carried by color and marking is not sufficient** — a character must be recognizable by shape alone. Silhouette readability, normally a craft heuristic in game art, becomes a functional requirement.

We therefore ask: *what, measurably, does a human-designed roster do that our generated characters do not?* And: *can the gap be closed by prompt-level intervention, without a human artist in the loop?*

Our contributions are:

1. A lightweight, reproducible set of **shape descriptors** for character images (contour complexity, solidity, bilateral symmetry), with an open implementation.
2. A quantitative characterization of how a large human-designed roster encodes **rank in shape rather than in color**.
3. Identification of the corresponding **failure mode in generated characters**: simple silhouettes, over-complex shading, no rank ladder, and identity that vanishes under silhouetting.
4. **Form-first prompting** as an intervention, evaluated with single-axis controlled sweeps that avoid the confounds of naive randomized comparison.
5. Two practical findings for practitioners: **rarity-coupled appendage injection** overrides body-plan control, and **negation backfire** makes prohibition lists counterproductive on models lacking a negative-prompt channel.

---

## 2. Related Work

**Character design principles.** The "silhouette test" — checking that a character remains identifiable when filled with a single color — is long-standing craft guidance in animation and game art [TODO-CITE: standard character design / animation texts; e.g. established art-direction references]. Commentary on the reference franchise specifically emphasizes deliberate restraint in information density and a single art director unifying the final illustrations [TODO-CITE: Iwata Asks interview, Nintendo; Creative Bloq retrospective on 30 years of the franchise's character design]. These sources are qualitative; to our knowledge the principle has not been quantified across a full roster and then used as a control signal for generative pipelines.

**Procedural content generation and evaluation.** Work on PCG has long grappled with evaluating generated artifacts along quality, diversity, and novelty [TODO-CITE: PCG survey; quality-diversity literature]. Evaluation of *generated images* is dominated by distributional measures such as FID and by diversity metrics [TODO-CITE: FID and successors]. These capture whether a set of images resembles a target distribution, but not whether the individual artifacts are *mutually distinguishable in shape* — which is exactly the property that collectible character design requires.

**Controllability of text-to-image models.** A substantial literature addresses attribute binding, compositional control, and prompt sensitivity in diffusion and autoregressive image models [TODO-CITE: attribute binding / compositionality work; prompt engineering studies]. The behavior of negation in particular has been noted as unreliable [TODO-CITE: work on negation handling in text-to-image models]. Our contribution here is narrow but practical: we show that in a production pipeline, control must be exerted on the *identity-bearing* axes (skeleton and silhouette-visible features), and that a naive coupling of a game-design variable (rarity) to visual elements silently destroys that control.

---

## 3. Measuring Character Silhouettes

### 3.1 Shape and surface descriptors

All descriptors are computed from a foreground mask obtained by alpha thresholding (α > 40); for images without an alpha channel, the background is estimated from corner pixels and separated by color distance. Images are normalized to a maximum dimension of 160 px, since all descriptors are scale-relative.

- **Contour complexity**: `perimeter / (2·√(π·area))`. This is the isoperimetric ratio, equal to 1.0 for a perfect disc and increasing with protrusions and boundary irregularity.
- **Solidity**: `area / convex_hull_area`. Near 1.0 for simple convex bodies; decreases as wings, horns, limbs, or spread appendages carve the outline.
- **Bilateral symmetry**: intersection-over-union between the mask and its horizontal mirror, computed within the bounding box. 1.0 indicates perfect left–right symmetry.
- **Surface descriptors**: **effective color count** (colors occupying ≥1% of the character area after quantization) and **edge density** (fraction of character pixels with strong local gradient), used to separate "complexity of shape" from "complexity of shading."

We emphasize that these are *proxies* for perceptual distinguishability, not measurements of it. Section 7 discusses this directly.

### 3.2 Corpora

**Reference roster.** A large, commercially produced creature franchise whose roster has been designed by human artists over three decades. We use 1025 creature silhouettes for taxonomy derivation, and 151 first-generation official illustrations, each labeled with a design role, for the rank analysis. Roles (early-game filler, mascot/cute, "cool" showpiece, starter, standalone, pseudo-legendary, legendary, novelty) were assigned from publicly documented game data — in particular base-stat totals and evolution structure — retrieved from a public API [TODO-CITE: PokéAPI].

**Generated corpus.** Characters produced by our deployed pipeline using a commercial text-to-image model. The pre-intervention baseline is 10 characters; the intervention experiments in Section 5 generate additional characters under controlled conditions.

**Intellectual property note.** We do not reproduce any copyrighted illustration from the reference roster in this paper. All reported values are derived statistics, and all displayed character images are our own generated outputs. Our analysis code operates on locally held copies and is released so that the measurements can be reproduced independently.

### 3.3 Deriving a body-plan taxonomy

To obtain a control vocabulary for generation, we clustered the 1025 reference silhouettes using shape information only. The clustering separates naturally into **14 groups**, which correspond closely to the franchise's own published body-shape classification (also 14 categories) — an encouraging convergence, since the two were derived independently (ours from pixel-level shape, theirs from editorial classification).

We adopt these 14 as our **body plans**: *round, quadruped, upright biped, squat/bottom-heavy, bird, big-winged flier, small biped critter, eared (feline), tailed biped, dragon/lizard, serpent, aquatic/fish, segmented insect, and wide multi-limbed*. Each is described to the generator as a skeleton (e.g. "a long legless serpent forming one single long curved line"), not as a texture or theme. Thematic content (plant, mineral, ghost, machine) is expressed as surface treatment *on top of* one of these skeletons rather than as a separate skeleton.

---

## 4. Study 1: How a Human-Designed Roster Encodes Rank

### 4.1 Setup

We computed all descriptors over the 151 role-labeled official illustrations and over the 10 baseline generated characters, and aggregated by role.

### 4.2 Results

| Role | n | Eff. colors | Contour | Solidity | Symmetry | Edge density |
|---|---|---|---|---|---|---|
| novelty | 23 | 44.7 | 1.55 | 0.81 | 0.70 | 0.31 |
| fast-evolving insect | 6 | 45.2 | 1.54 | 0.78 | 0.48 | 0.37 |
| mascot / cute | 18 | 43.9 | 1.82 | 0.71 | 0.53 | 0.31 |
| starter | 9 | 45.9 | 1.81 | 0.76 | 0.58 | 0.35 |
| early-game filler | 46 | 45.7 | 1.94 | 0.70 | 0.54 | 0.38 |
| standalone | 7 | 47.1 | 2.12 | 0.65 | 0.57 | 0.38 |
| "cool" showpiece | 36 | 47.1 | 2.20 | 0.65 | 0.50 | 0.41 |
| pseudo-legendary | 1 | 44.0 | 2.26 | 0.62 | 0.49 | 0.39 |
| **legendary** | 5 | 47.8 | **3.19** | **0.54** | **0.38** | 0.45 |
| **generated (baseline)** | 10 | **48.7** | **1.44** | **0.87** | 0.65 | 0.34 |

### 4.3 Findings

**F1 — Rank is encoded in shape, not color.** Moving up the role hierarchy, contour complexity roughly doubles (1.55 → 3.19), solidity falls (0.81 → 0.54), and symmetry falls (0.70 → 0.38). Effective color count, by contrast, varies only between 43.9 and 47.8 with no monotone trend. In this roster, "importance" is communicated by an increasingly intricate, asymmetric outline — not by a richer palette.

**F2 — Generated characters spend complexity in the wrong dimension.** The baseline generated set has the *lowest* contour complexity (1.44) and the *highest* solidity (0.87) of any group — rounder and simpler in outline than even the simplest human-designed tier — while simultaneously having the *highest* effective color count (48.7). The generator produces elaborate shading on top of an under-articulated shape.

**F3 — There is no rank ladder.** The baseline generated characters cluster tightly on all shape descriptors, meaning that a character intended to be rare is not shaped differently from a common one. Combined with F2, the consequence is that identity is carried by color and marking; reducing the characters to black silhouettes makes them mutually indistinguishable, which violates our downstream requirements (Section 1).

---

## 5. Study 2: Form-First Prompting

### 5.1 Intervention

We restructure the prompt so that identity is assigned in a fixed priority order:

1. **Body plan** (one of the 14 skeletons), stated as the single most important property of the image.
2. **A silhouette-visible feature** (long ears, fluffy tail, multiple tails, horns, wings, fins, antennae, back fin, crest), which must protrude from the outline.
3. **Surface** (color, marking, mood) — explicitly demoted to flavor.

Rank (rarity) is expressed by *enlarging and elaborating the character's own body plan and its own feature*, rather than by adding new parts. Crucially, we state positively that any protrusion in the outline originates from the body plan or the assigned feature; we do not enumerate prohibited parts (see Section 6.1).

### 5.2 Protocol: single-axis sweeps

Our first comparisons randomized body plan, rarity, and feature simultaneously, which made results uninterpretable: differences in mean shape between conditions were confounded by differences in the sampled rarity mix. We therefore adopted a **single-axis sweep** protocol — hold every condition fixed and vary exactly one axis — implemented in an experiment harness that also computes the descriptors in-browser and renders each output as a black silhouette for inspection. We report four experiments (E-A to E-D).

### 5.3 E-A: Effect of the body-plan taxonomy (A/B)

Twelve characters per condition, matched pipeline, with and without the 14-skeleton taxonomy (the "without" condition uses the pipeline's previous, blob-oriented body descriptions).

| Condition | Mean contour | Range | Solidity | Symmetry | σ(contour) |
|---|---|---|---|---|---|
| With taxonomy (14) | **2.21** | 1.45–3.30 | 0.73 | 0.58 | **0.50** |
| Without (previous, 10) | 1.75 | 1.12–2.40 | 0.78 | 0.75 | 0.39 |

The mean shift matters less than the **increase in between-character variance** (σ 0.39 → 0.50): the goal is not "more complex" but "different from one another." Qualitatively, the no-taxonomy condition repeatedly produced low-rarity characters as near-identical rounded masses with symmetry values saturating at 1.00.

We note a confound: the two batches did not have identical rarity composition. E-B and E-D below control for this directly.

### 5.4 E-B: Body plan alone (rarity fixed at lowest, no feature)

Sweeping all body plans at the lowest rarity with no assigned feature isolates the discriminative power of the skeleton itself. (Five of fourteen generations failed due to API rate limits; nine completed.)

Structurally extreme skeletons separate clearly even at the lowest rarity — serpent (contour 1.50, symmetry 0.46), wide multi-limbed (1.51), quadruped (1.18), eared (1.22). Compact skeletons converge — round (1.01), bird (0.97), small biped (1.14), upright (1.14) — with symmetry between 0.77 and 1.00.

This is a direct consequence of the design specification for the lowest tier ("simple, rounded, close to symmetric"), which deliberately suppresses shape articulation. **Body plan alone therefore does not cover the whole roster**; it discriminates strongly only where the skeleton is topologically distinctive.

### 5.5 E-C: The rank ladder (body plan and feature fixed)

Sweeping the four rarity tiers with body plan and feature held constant, three repetitions per tier (quadruped; ten of twelve generations completed):

| Tier | n | Contour | Solidity | Symmetry |
|---|---|---|---|---|
| common | 3 | 2.79 | 0.74 | 0.51 |
| rare | 2 | 2.34 | 0.76 | 0.50 |
| epic | 3 | 3.26 | 0.63 | 0.42 |
| legendary | 2 | 3.24 | 0.65 | 0.45 |

**Solidity (0.74 → 0.63) and symmetry (0.51 → 0.42) move in the expected direction, but contour complexity is not monotone.** Inspection indicates the cause is textural: the assigned feature for this sweep was a long/fluffy tail, and fur fringing inflates perimeter at every tier, swamping the tier signal in the contour metric specifically. Qualitatively the escalation is clearly present — low tiers render as compact, rounded animals; high tiers acquire manes, spikes, and dynamic postures — while the quadruped skeleton is preserved throughout.

We take this as evidence that **rank escalation works at the design level but that contour complexity is the wrong statistic to certify it** (Section 6.2).

### 5.6 E-D: Within-skeleton differentiation (round body, lowest rarity)

Holding the skeleton at *round* — the case most prone to collapse — and the rarity at the lowest tier, we sweep the assigned feature against a no-feature baseline:

| Feature | Contour | Solidity | Symmetry |
|---|---|---|---|
| none (baseline) | 1.08 | 0.93 | 1.00 |
| **long ears** | **1.32** | 0.77 | 1.00 |
| two horns | 1.24 | 0.88 | 0.94 |
| crest | 1.21 | 0.87 | 0.87 |
| fluffy tail | 1.12 | 0.93 | 0.76 |
| fins | 1.10 | 0.92 | 0.85 |
| wings | 1.05 | 0.93 | 0.67 |

Every feature moves the silhouette away from the baseline, confirming that features provide within-skeleton identity. But they do so through **different channels**: features that protrude from the top of the outline (ears, horns, crest) raise contour complexity, whereas laterally attached features (tail, wings) primarily break symmetry.

Notably, **wings barely alter the outline of a round body** (contour 1.05 vs. baseline 1.08): on a compact skeleton the generator renders them as small lateral bumps. This implies a **skeleton–feature compatibility structure** — a feature must be assigned to a body plan that can express it — which we encode as a compatibility table in the deployed system.

In a complementary condition with features disabled entirely, two bird-skeleton characters at adjacent low tiers rendered as effectively the same featureless ovoid (contour 1.03 and 0.99, symmetry 1.00 for both), illustrating the failure that features are introduced to prevent.

### 5.7 Failure mode: rarity-coupled appendage injection

Our initial implementation expressed high rarity by instructing the model to add "wings, horns, a sweeping tail, spikes." Across three independent runs, this **overrode the requested body plan**: serpents, insects, and birds at high rarity all converged toward a similar winged, spiked mass. The rank instruction was, in effect, a competing body-plan instruction.

Removing the appendage nouns from the rarity text — and re-expressing rank as *"the grandest, most imposing version of this creature, with its own body form and its own identifying feature pushed to their fullest"* — resolved the conflict. A serpent generated at the highest rarity then remained a serpent, elaborated through coil, fins, and crest rather than acquiring wings.

**Practical implication:** when a system couples a game-design variable to visual content, that coupling must be expressed in terms of the *existing* identity axes. Otherwise it competes with them, and the more specific instruction (a named body part) tends to win over the more abstract one (a body plan).

---

## 6. Discussion

### 6.1 Negation backfire

The image model in our pipeline has no separate negative-prompt channel; all text is conditioning. In an earlier production incident, generated characters intermittently included fragments of image-editor user interface. The prompt at the time contained an explicit prohibition list naming exactly those artifacts ("no toolbars," "no checkerboard," "not a screenshot," and similar). Removing the prohibition list — and instead positively asserting the desired state ("the character is fully isolated on a single flat, empty, pure-white background… only the one character is in the picture") — eliminated the artifact.

We therefore treat prohibition lists as an anti-pattern for models without a negative channel: naming an unwanted concept injects it. This shaped the intervention in Section 5.1, where we constrain protrusions *positively* rather than forbidding named parts.

This observation is anecdotal — it arises from a production incident, not a controlled experiment — and we report it as such. A systematic study of negation handling would be valuable [TODO-CITE: existing work on negation in text-to-image models, if available].

### 6.2 Limitations of the metrics

**Contour complexity is texture-sensitive.** Fur, fringing, and fluff inflate perimeter without changing gross shape, which is precisely what corrupted the rank ladder in E-C. Solidity and symmetry are more robust to this and should carry more weight when certifying rank.

**Enclosed background biases the mask.** Our background removal uses a flood fill seeded from the image border, so background fully enclosed by the character — for example the interior of a coiled serpent — remains opaque and is counted as body. This inflates area and deflates contour complexity for looping poses. We added a color-based hole-filling correction; on a coiled serpent this recovered roughly 1% of the character area as background and visibly opened the coil interiors in the silhouette. Any silhouette-based pipeline should handle this case explicitly.

**The metrics are proxies.** They are motivated by, but not validated against, human perceptual discrimination. This is the principal open issue (Section 7).

### 6.3 Implications for practice

- **Fix the identity-bearing axes; delegate surface to the model.** Left unconstrained, the generator regresses toward a rounded blob, because that is the modal solution for "cute mascot." Skeleton and silhouette-visible feature should be selected by the system, not by the model.
- **Express rank by escalating what is already there.** Enlarging and elaborating the existing body plan and feature preserves identity; adding new parts does not.
- **Match features to skeletons.** Compatibility is not decorative; an incompatible pairing yields a feature that does not reach the outline and therefore contributes nothing to identity.
- **Silhouette QC is cheap and automatable.** The descriptors run in milliseconds in a browser and can gate acceptance at generation time.

---

## 7. Limitations and Threats to Validity

- **No human perceptual validation.** Our descriptors are proxies for distinguishability, and the central claim — that form-first prompting makes characters *more recognizable* — is currently supported by shape statistics and author inspection, not by measured human performance. This is the most important gap and the first item of future work.
- **Single model, single art style.** All generations use one commercial text-to-image model under a single fixed house style. Generalization to other models and styles is untested.
- **Small samples.** Conditions contain between 1 and 12 characters; the rank ladder in particular is under-powered, and several cells lost samples to API rate limits and daily quotas.
- **Single-franchise reference.** The reference roster is one franchise with a strong house style; it is not a neutral sample of "human-designed characters."
- **Role labels are interpretive.** Although anchored to published game data (base-stat totals, evolution structure), the mapping from those data to design roles involves author judgment.
- **Author-run inspection.** Qualitative judgments (e.g. "the serpent remained a serpent") were made by the authors, who were not blind to condition.

---

## 8. Conclusion and Future Work

The weakness of current generative character design, in our setting, is not draftsmanship but **the placement of identity**: models reliably produce attractive surfaces on under-articulated shapes, so identity migrates to color and marking and does not survive silhouetting. This is measurable with simple shape descriptors, and it is repairable at the prompt level by fixing a body plan and a silhouette-visible feature and by expressing rank as escalation of those same elements.

Future work:

1. **Human perceptual study.** Present black silhouettes only and measure (a) same/different discrimination between character pairs and (b) body-plan classification accuracy, comparing pre- and post-intervention sets. We estimate n ≈ 30–50 participants suffices to test whether the shape descriptors track human discrimination. This would convert the present proxy-based argument into a perceptual one.
2. **Replication across models.** Repeat the A/B and sweeps on additional text-to-image models to separate model-specific behavior from general behavior.
3. **Better rank certification.** Develop a texture-robust complexity statistic, or certify rank on solidity and symmetry with contour complexity used only as a secondary signal.
4. **Lineage consistency.** Extend form-first control to families: inherit a parent's body plan and feature to generate visually consistent evolutionary lines, testing whether "same family, different stage" is perceptible from silhouette alone.
5. **Acceptance gating.** Integrate silhouette QC as an automatic accept/reject gate in the production pipeline, including a novelty check against previously generated characters.

---

## Reproducibility

We release the descriptor implementation and the experiment harness used for all sweeps in Section 5, including the exact prompt templates for both conditions of the A/B. Reported values can be recomputed from any set of character images. The reference roster's copyrighted illustrations are not redistributed; the analysis operates on locally obtained copies, and only derived statistics are reported.

[TODO: repository URL, license, DOI]

---

## References

[TODO-CITE] — All references below are placeholders describing what must be cited. **Do not submit until these are replaced with verified, real sources.**

1. [TODO-CITE] Standard reference on character design / silhouette readability in animation or game art.
2. [TODO-CITE] Nintendo "Iwata Asks" interview discussing unification of character illustration style.
3. [TODO-CITE] Creative Bloq (or equivalent) retrospective on the franchise's character design principles.
4. [TODO-CITE] PokéAPI — public API used to retrieve base stats and evolution chains.
5. [TODO-CITE] Survey of procedural content generation in games.
6. [TODO-CITE] Quality-diversity / novelty-search literature relevant to generated artifact evaluation.
7. [TODO-CITE] FID and successor metrics for generative image evaluation.
8. [TODO-CITE] Work on compositionality and attribute binding in text-to-image models.
9. [TODO-CITE] Work on negation handling in text-to-image models (if available).

---

## Appendix A: Descriptor definitions

Given a binary foreground mask `M`:

- `area = |M|`
- `perimeter = |{p ∈ M : ∃ 4-neighbour q ∉ M}|`
- `contour = perimeter / (2·√(π·area))`
- `solidity = area / area(ConvexHull(∂M))`
- `symmetry = |M ∩ mirror(M)| / |M ∪ mirror(M)|`, computed within the bounding box of `M`

Masks are obtained by alpha thresholding (α > 40) after background removal; enclosed background regions are recovered by a color-based hole-filling pass (Section 6.2). Images are resized so that `max(width, height) = 160` before computation.

## Appendix B: The 14 body plans

round; quadruped; upright biped; squat/bottom-heavy; bird; big-winged flier; small biped critter; eared (feline); tailed biped; dragon/lizard; serpent; aquatic/fish; segmented insect; wide multi-limbed.

Each is specified to the generator as a skeletal description. Thematic categories (plant, mineral, machine, ghost) are expressed as surface treatment on one of these skeletons rather than as separate skeletons, to keep the number of distinguishable outlines bounded.
