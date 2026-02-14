# 01_data_model

## Overview
Core data model for Rockcut: 13 tables covering brands, recipes (with ingredients, mash steps, process steps, water profiles), ingredient library (categories, field definitions, lots), batches (brew turns, log entries).

## Deliverables

### Foundation
| ID | File | Purpose | Status |
|----|------|---------|--------|
| D1 | specs/d01_data_model_spec.md | 13-table schema design (approved with Matt) | COMPLETE |
| D2 | results/d02_crud_apis_COMPLETE.md | 13 controllers, Brewing context, 65+ routes | COMPLETE |

## Common Tasks
- "What tables exist?" -> See specs/d01_data_model_spec.md
- "How do batches relate to recipes?" -> Batches link to brands; brew_turns link to recipes

## Key Decisions
- Batches link to brands (not recipes) — a batch may use multiple recipes across turns
- Brew turns handle multi-turn fills — each turn references a specific recipe version
- Ingredient lots have category-specific fields (alpha_acid for hops, color_lovibond for grains, etc.)
- Category field definitions allow user-defined custom fields per ingredient category
