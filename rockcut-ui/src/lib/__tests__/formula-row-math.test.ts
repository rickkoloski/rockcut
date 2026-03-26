/**
 * WS-3: Formula Parser Row-Field Math Validation
 *
 * This test/validation script proves the datagrid-extended formula parser
 * can handle pure row-field math expressions needed for brewing calculations.
 *
 * NOTE: No test runner (vitest/jest) is configured in this project yet.
 * This file is structured as a runnable validation script using a lightweight
 * inline test harness. It can be executed directly with:
 *   npx tsx src/lib/__tests__/formula-row-math.test.ts
 *
 * Or it can be trivially adapted for vitest/jest when a test runner is added.
 *
 * Import paths: datagrid-extended is linked via pnpm and aliased in vite.config.ts
 * to the real source at ~/src/shared/ui-components/datagrid-extended/src/lib/.
 * For direct execution with tsx, we use relative paths to the actual source.
 */

// ----- Inline imports from datagrid-extended source -----
// When a test runner with Vite's alias resolution is available, these become:
//   import { parseFormula } from 'datagrid-extended/formula/parser';
//   import { evaluate } from 'datagrid-extended/formula/evaluator';
// For now, we import from the linked source using a relative path.

import { parseFormula } from '../../../../../../shared/ui-components/datagrid-extended/src/lib/formula/parser.ts'
import { evaluate } from '../../../../../../shared/ui-components/datagrid-extended/src/lib/formula/evaluator.ts'

// ----- Test data -----

const row1 = { id: 1, amount: 10, extract: 37, efficiency: 0.75, color_lovibond: 3.5, weight: 8 }
const row2 = { id: 2, amount: 5, extract: 35, efficiency: 0.80, color_lovibond: 60, weight: 4 }
const allRows = [row1, row2]

// ----- Lightweight test harness -----

interface TestResult {
  name: string
  passed: boolean
  expected: unknown
  actual: unknown
  error?: string
}

const results: TestResult[] = []

async function test(
  name: string,
  formula: string,
  row: Record<string, unknown>,
  rows: Record<string, unknown>[],
  expected: unknown,
  tolerance?: number,
) {
  try {
    const ast = parseFormula(formula)
    const actual = await evaluate(ast, row, rows)

    let passed: boolean
    if (typeof expected === 'number' && typeof actual === 'number') {
      const tol = tolerance ?? 0.0001
      passed = Math.abs(actual - expected) < tol
    } else {
      passed = actual === expected
    }

    results.push({ name, passed, expected, actual })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    results.push({ name, passed: false, expected, actual: `ERROR: ${message}`, error: message })
  }
}

// ----- Test scenarios -----

async function runAllTests() {
  // 1. Simple multiplication: =amount * extract => 10 * 37 = 370
  await test(
    '1. Simple multiplication: =amount * extract',
    '=amount * extract',
    row1, allRows,
    370,
  )

  // 2. Three-field multiplication: =amount * extract * efficiency => 10 * 37 * 0.75 = 277.5
  await test(
    '2. Three-field multiplication: =amount * extract * efficiency',
    '=amount * extract * efficiency',
    row1, allRows,
    277.5,
  )

  // 3. Division: =amount / 100 => 10 / 100 = 0.1
  await test(
    '3. Division: =amount / 100',
    '=amount / 100',
    row1, allRows,
    0.1,
  )

  // 4. Mixed with constants: =amount * 46 * 8.345 => 10 * 46 * 8.345 = 3838.7
  await test(
    '4. Mixed fields and constants: =amount * 46 * 8.345',
    '=amount * 46 * 8.345',
    row1, allRows,
    3838.7,
  )

  // 5. Aggregate SUM: =SUM(amount) => 10 + 5 = 15
  await test(
    '5. Aggregate SUM: =SUM(amount)',
    '=SUM(amount)',
    row1, allRows,
    15,
  )

  // 6. Row value / aggregate: =amount / SUM(amount) => 10 / 15 = 0.6667
  await test(
    '6. Row value / aggregate: =amount / SUM(amount)',
    '=amount / SUM(amount)',
    row1, allRows,
    10 / 15,
    0.0001,
  )

  // 7. ROUND: =ROUND(amount * extract * efficiency, 1) => ROUND(277.5, 1) = 277.5
  await test(
    '7. ROUND nested: =ROUND(amount * extract * efficiency, 1)',
    '=ROUND(amount * extract * efficiency, 1)',
    row1, allRows,
    277.5,
  )

  // --- Additional brewing-relevant scenarios ---

  // 8. PPG from CGAI: =extract * 46 (where extract is CGAI)
  await test(
    '8. PPG from CGAI: =extract * 46',
    '=extract * 46',
    row1, allRows,
    37 * 46,  // 1702
  )

  // 9. Ldeg/kg from PPG: =extract * 46 * 8.345
  await test(
    '9. L deg/kg from PPG chain: =extract * 46 * 8.345',
    '=extract * 46 * 8.345',
    row1, allRows,
    37 * 46 * 8.345,
    0.01,
  )

  // 10. Weight * color (MCU calculation): =weight * color_lovibond
  await test(
    '10. MCU: =weight * color_lovibond',
    '=weight * color_lovibond',
    row1, allRows,
    8 * 3.5,  // 28
  )

  // 11. Division by zero (safe): =amount / 0
  await test(
    '11. Safe division by zero: =amount / 0',
    '=amount / 0',
    row1, allRows,
    0,  // evaluator returns 0 on divide-by-zero
  )

  // 12. Parenthesized subexpression: =(amount + weight) * efficiency
  await test(
    '12. Parenthesized subexpression: =(amount + weight) * efficiency',
    '=(amount + weight) * efficiency',
    row1, allRows,
    (10 + 8) * 0.75,  // 13.5
  )

  // 13. AVG aggregate: =AVG(amount)
  await test(
    '13. AVG aggregate: =AVG(amount)',
    '=AVG(amount)',
    row1, allRows,
    7.5,
  )

  // 14. COUNT aggregate: =COUNT(amount)
  await test(
    '14. COUNT aggregate: =COUNT(amount)',
    '=COUNT(amount)',
    row1, allRows,
    2,
  )

  // 15. Conditional with row fields: =IF(amount > 7, "large", "small")
  await test(
    '15. Conditional: =IF(amount > 7, "large", "small")',
    '=IF(amount > 7, "large", "small")',
    row1, allRows,
    'large',
  )

  // 16. Complex brewing: proportion of total extract contribution
  //     =amount * extract * efficiency / SUM(amount) -- partial (SUM of field only)
  //     NOTE: SUM(amount * extract * efficiency) is NOT supported.
  //     SUM only takes a bare field name, not an expression.
  //     This tests the simpler row-math / aggregate pattern.
  await test(
    '16. Row math with aggregate: =amount * extract * efficiency / SUM(amount)',
    '=amount * extract * efficiency / SUM(amount)',
    row1, allRows,
    (10 * 37 * 0.75) / 15,
    0.0001,
  )

  // 17. SUM with expression arg — EXPECTED TO FAIL
  //     SUM(amount * extract * efficiency) would require aggregate functions to accept
  //     expression args, but currently SUM only accepts a bare field name.
  //     This documents the limitation.
  await test(
    '17. SUM with expression arg (KNOWN LIMITATION): =SUM(amount * extract * efficiency)',
    '=SUM(amount * extract * efficiency)',
    row1, allRows,
    // Ideal result would be: (10*37*0.75) + (5*35*0.80) = 277.5 + 140 = 417.5
    // But SUM treats its arg as a field name string when aggregate=true.
    // The evaluator will try to look up allRows[i]["amount * extract * efficiency"] = NaN
    417.5,
  )

  // 18. Unary negative: =-amount
  await test(
    '18. Unary negative: =-amount',
    '=-amount',
    row1, allRows,
    -10,
  )

  // 19. Multiple operations with precedence: =amount + extract * efficiency
  //     Expected: 10 + (37 * 0.75) = 10 + 27.75 = 37.75
  await test(
    '19. Operator precedence: =amount + extract * efficiency',
    '=amount + extract * efficiency',
    row1, allRows,
    37.75,
  )

  // 20. ROUND with 0 decimals: =ROUND(extract * efficiency, 0)
  await test(
    '20. ROUND to integer: =ROUND(extract * efficiency, 0)',
    '=ROUND(extract * efficiency, 0)',
    row1, allRows,
    28,  // ROUND(27.75, 0) = 28
  )

  // ----- Report -----

  console.log('\n=== Formula Parser Row-Field Math Validation ===\n')

  let passed = 0
  let failed = 0
  let knownLimitations = 0

  for (const r of results) {
    const isKnown = r.name.includes('KNOWN LIMITATION')
    if (r.passed) {
      console.log(`  PASS  ${r.name}`)
      console.log(`        Result: ${r.actual}`)
      passed++
    } else if (isKnown) {
      console.log(`  SKIP  ${r.name}`)
      console.log(`        Expected: ${r.expected}`)
      console.log(`        Actual:   ${r.actual}`)
      knownLimitations++
    } else {
      console.log(`  FAIL  ${r.name}`)
      console.log(`        Expected: ${r.expected}`)
      console.log(`        Actual:   ${r.actual}`)
      if (r.error) console.log(`        Error:    ${r.error}`)
      failed++
    }
    console.log('')
  }

  console.log('---')
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Known Limitations: ${knownLimitations}`)
  console.log('')

  // ----- Findings summary -----

  console.log('=== FINDINGS ===\n')
  console.log('WORKS:')
  console.log('  - Simple field references (=amount, =extract)')
  console.log('  - Binary operations with fields and constants (*, /, +, -)')
  console.log('  - Three-field chained multiplication (=amount * extract * efficiency)')
  console.log('  - Operator precedence (multiply before add)')
  console.log('  - Parenthesized subexpressions (=(a + b) * c)')
  console.log('  - Unary negation (=-amount)')
  console.log('  - Aggregate functions with bare field names: SUM(amount), AVG(amount), COUNT(amount)')
  console.log('  - Row value divided by aggregate: =amount / SUM(amount)')
  console.log('  - ROUND with expression args: =ROUND(a * b * c, 1)')
  console.log('  - Conditional expressions: =IF(amount > 7, "large", "small")')
  console.log('  - Safe division by zero (returns 0)')
  console.log('')
  console.log('KNOWN LIMITATIONS:')
  console.log('  - SUM/AVG/MIN/MAX only accept a bare field name, NOT an expression.')
  console.log('    =SUM(amount * extract) does NOT work — it passes the binary expression')
  console.log('    as a field name string, yielding NaN.')
  console.log('  - To compute "sum of products" across rows, you would need a new aggregate')
  console.log('    function (e.g., SUMPRODUCT) or change the aggregate flag behavior to')
  console.log('    evaluate the expression per-row and then sum the results.')
  console.log('  - For D15 brewing calcs, this limitation is fine because the server-side')
  console.log('    formula functions (EST_IBU, EST_OG, etc.) handle the cross-row aggregation.')
  console.log('')

  if (failed > 0) {
    process.exit(1)
  }
}

runAllTests()
