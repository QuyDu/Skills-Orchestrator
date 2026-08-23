---
mode: agent
description: Analyze this project and prepare a reviewable LinkedIn post draft.
---

# LinkedIn Post

Run the `linkedin-post` skill.

The skill creates a draft only. Save it to `reports/linkedin-post-draft.md` and present it to the user for review. Never publish directly to LinkedIn.

Options:

- `--update` compares the current project with `reports/linkedin-post-history.md` and describes only verified new features, improvements, or milestones.
- `--technical` uses a technical tone.
- `--executive` uses an outcome-focused executive tone.
- `--community` uses a technically accessible community tone and is the default.

Do not include secrets, confidential details, unsupported metrics, private URLs, or claims not supported by current project evidence.
