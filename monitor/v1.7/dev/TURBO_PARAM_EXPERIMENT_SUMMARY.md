# V1.7 Turbo Params Round 2

Date: 2026-04-04  
Branch: `dev_v1.6`  
Model: `turbo`  
Scope: `face_short`, `face_medium`, `musk_21s`

Result JSON: `monitor/v1.7/dev/turbo_param_experiment_results.json`

## Configs Tested

| ID | beam_size | vad_filter | condition_on_previous_text |
| --- | ---: | :---: | :---: |
| `b5_vad1_ctx0` | 5 | on | off |
| `b3_vad1_ctx0` | 3 | on | off |
| `b3_vad0_ctx0` | 3 | off | off |
| `b3_vad1_ctx1` | 3 | on | on |

## Summary

| Config | face_short | face_medium | musk_21s | Avg wall time |
| --- | ---: | ---: | ---: | ---: |
| `b5_vad1_ctx0` | 100.00% | 33.33% | 86.67% | 6.05s |
| `b3_vad1_ctx0` | 100.00% | 11.11% | 86.67% | 5.98s |
| `b3_vad0_ctx0` | 100.00% | 11.11% | 86.67% | 5.96s |
| `b3_vad1_ctx1` | 100.00% | 11.11% | 86.67% | 6.05s |

## Readout

- `face_short` stayed correct in every config: `Hello, how are you today?`
- `musk_21s` was effectively unchanged across configs. Turbo still produced the same long-form substitutions, including `Deep State` and `amount of challenge`.
- `face_medium` did not recover under any tested combo.
- Best tested turbo candidate remained `b5_vad1_ctx0`, but it still returned a truncated short fragment: `the quick brown.`
- Lowering beam to `3`, disabling VAD, or enabling `condition_on_previous_text` did not help `face_medium`; those variants regressed to `a quick run`.

## Decision

- Keep `medium` as the default baseline.
- If turbo stays under consideration, keep `beam_size=5`, `vad_filter=true`, `condition_on_previous_text=false` as the current best tested turbo setting.
- Do not rely on turbo parameter tuning alone to solve the short-fragment issue.
- The backend quality gate follow-up is still required to catch outputs like `the quick brown.` / `a quick run` while allowing valid short sentences like `Hello, how are you today?`

## Notes

- This run was executed in the current sandbox. `/usr/bin/time -l` could not read all kernel timing counters, so wall time is reliable but peak RSS was not available from this run.
