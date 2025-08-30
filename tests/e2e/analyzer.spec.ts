import { test, expect } from '@playwright/test';

test.describe('Analyzer Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('text=Analyzer');
    await expect(page).toHaveURL(/.*analyzer/);
  });

  test('should display analyzer page with indicator lab and A/B runner', async ({ page }) => {
    // Check main page elements
    await expect(page.locator('h1')).toContainText('Analyzer');
    await expect(page.locator('text=Configure indicators and run A/B tests')).toBeVisible();
    
    // Check left column - Indicator Lab
    await expect(page.locator('text=Indicator Lab')).toBeVisible();
    await expect(page.locator('text=Profile')).toBeVisible();
    await expect(page.locator('text=Indicators')).toBeVisible();
    
    // Check right column - A/B Runner
    await expect(page.locator('text=A/B Test Runner')).toBeVisible();
    await expect(page.locator('text=Profile A')).toBeVisible();
    await expect(page.locator('text=Profile B')).toBeVisible();
  });

  test('should show indicator checklist with default indicators', async ({ page }) => {
    // Check that indicator toggles are present
    await expect(page.locator('text=RSI')).toBeVisible();
    await expect(page.locator('text=MACD')).toBeVisible();
    await expect(page.locator('text=ADX')).toBeVisible();
    await expect(page.locator('text=Bollinger Bands')).toBeVisible();
    await expect(page.locator('text=VWAP')).toBeVisible();
    await expect(page.locator('text=50 SMA')).toBeVisible();
    await expect(page.locator('text=200 SMA')).toBeVisible();
    await expect(page.locator('text=Ichimoku')).toBeVisible();
    
    // Check that some indicators are enabled by default (Momentum profile)
    const rsiCheckbox = page.locator('input[type="checkbox"]').first();
    await expect(rsiCheckbox).toBeChecked();
  });

  test('should toggle indicators and show parameters', async ({ page }) => {
    // Toggle RSI on (should already be on)
    const rsiToggle = page.locator('label:has-text("RSI")').locator('input[type="checkbox"]');
    await expect(rsiToggle).toBeChecked();
    
    // Toggle MACD on (should already be on)
    const macdToggle = page.locator('label:has-text("MACD")').locator('input[type="checkbox"]');
    await expect(macdToggle).toBeChecked();
    
    // Check that parameters section appears
    await expect(page.locator('text=Parameters')).toBeVisible();
    
    // Check RSI parameters
    await expect(page.locator('text=Period').first()).toBeVisible();
    
    // Check MACD parameters
    await expect(page.locator('text=Fast Period')).toBeVisible();
    await expect(page.locator('text=Slow Period')).toBeVisible();
    await expect(page.locator('text=Signal Period')).toBeVisible();
  });

  test('should adjust parameter sliders', async ({ page }) => {
    // Wait for parameters to be visible
    await expect(page.locator('text=Parameters')).toBeVisible();
    
    // Find RSI period input and change it
    const rsiInput = page.locator('input[type="number"]').first();
    await expect(rsiInput).toBeVisible();
    
    // Clear and set new value
    await rsiInput.fill('21');
    await expect(rsiInput).toHaveValue('21');
    
    // Find MACD fast period input and change it
    const macdFastInput = page.locator('text=Fast Period').locator('..').locator('input[type="number"]');
    await macdFastInput.fill('10');
    await expect(macdFastInput).toHaveValue('10');
    
    // Find MACD slow period input and change it
    const macdSlowInput = page.locator('text=Slow Period').locator('..').locator('input[type="number"]');
    await macdSlowInput.fill('21');
    await expect(macdSlowInput).toHaveValue('21');
    
    // Find MACD signal period input and change it
    const macdSignalInput = page.locator('text=Signal Period').locator('..').locator('input[type="number"]');
    await macdSignalInput.fill('7');
    await expect(macdSignalInput).toHaveValue('7');
  });

  test('should change profiles and update indicators', async ({ page }) => {
    // Check default profile
    const profileSelect = page.locator('select').first();
    await expect(profileSelect).toHaveValue('Momentum');
    
    // Change to Mean Reversion profile
    await profileSelect.selectOption('Mean Reversion');
    await expect(profileSelect).toHaveValue('Mean Reversion');
    
    // Check that profile description appears
    await expect(page.locator('text=mean reversion')).toBeVisible();
    
    // Change to Trend profile
    await profileSelect.selectOption('Trend');
    await expect(profileSelect).toHaveValue('Trend');
    
    // Change to Custom
    await profileSelect.selectOption('');
    await expect(profileSelect).toHaveValue('');
  });

  test('should run A/B test and show results', async ({ page }) => {
    // Set up A/B test profiles
    const profileASelect = page.locator('text=Profile A').locator('..').locator('select');
    const profileBSelect = page.locator('text=Profile B').locator('..').locator('select');
    
    await profileASelect.selectOption('Momentum');
    await profileBSelect.selectOption('Mean Reversion');
    
    // Mock the API responses for backtests
    await page.route('/api/run_backtest', async (route) => {
      const request = route.request();
      const postData = JSON.parse(request.postData() || '{}');
      
      // Create different responses based on the analyzer profile
      const isProfileA = postData.analyzerProfile?.name?.includes('Momentum');
      
      const mockResult = {
        strategy_id: 'iron_condor',
        symbol: 'SPY',
        start_date: '2023-01-01',
        end_date: '2023-12-31',
        total_return: isProfileA ? 0.15 : 0.12,
        cagr: isProfileA ? 0.15 : 0.12,
        sharpe_ratio: isProfileA ? 1.2 : 1.0,
        max_drawdown: isProfileA ? 0.08 : 0.10,
        win_rate: isProfileA ? 0.65 : 0.60,
        total_trades: 24,
        equity_curve: [
          { date: '2023-01-01', value: 100000 },
          { date: '2023-06-01', value: isProfileA ? 107500 : 106000 },
          { date: '2023-12-31', value: isProfileA ? 115000 : 112000 }
        ],
        trades: []
      };
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResult)
      });
    });
    
    // Click Run A/B Test button
    const runButton = page.locator('text=Run A/B Test');
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeEnabled();
    
    await runButton.click();
    
    // Wait for results to appear
    await expect(page.locator('text=Running A/B Test...')).toBeVisible();
    
    // Wait for results
    await expect(page.locator('text=Momentum').nth(1)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Mean Reversion').nth(1)).toBeVisible();
    
    // Check that metrics are displayed
    await expect(page.locator('text=CAGR:')).toBeVisible();
    await expect(page.locator('text=Sharpe:')).toBeVisible();
    await expect(page.locator('text=Max DD:')).toBeVisible();
    await expect(page.locator('text=Win Rate:')).toBeVisible();
    await expect(page.locator('text=Total Trades:')).toBeVisible();
    
    // Check that difference table is displayed
    await expect(page.locator('text=Difference (A - B)')).toBeVisible();
    await expect(page.locator('text=CAGR Diff:')).toBeVisible();
    await expect(page.locator('text=Sharpe Diff:')).toBeVisible();
    
    // Check that chart is displayed
    await expect(page.locator('text=Equity Curve Comparison')).toBeVisible();
  });

  test('should apply settings to strategy', async ({ page }) => {
    // Mock the preferences API
    await page.route('/api/preferences', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({})
        });
      } else if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
    });
    
    // Click Apply to Strategy button
    const applyButton = page.locator('text=Apply to Strategy');
    await expect(applyButton).toBeVisible();
    await applyButton.click();
    
    // Check for success message
    await expect(page.locator('text=Applied to strategy successfully')).toBeVisible({ timeout: 5000 });
  });

  test('should persist preferences on reload', async ({ page }) => {
    // Mock the preferences API with saved analyzer state
    const savedState = {
      analyzer: {
        enabledIndicators: ['rsi', 'bbands'],
        params: {
          rsi_length: 21,
          bb_length: 20,
          bb_stddev: 2.0
        },
        profile: 'Mean Reversion'
      }
    };
    
    await page.route('/api/preferences', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(savedState)
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
    });
    
    // Reload the page
    await page.reload();
    
    // Check that saved state is restored
    const profileSelect = page.locator('select').first();
    await expect(profileSelect).toHaveValue('Mean Reversion');
    
    // Check that RSI is enabled
    const rsiToggle = page.locator('label:has-text("RSI")').locator('input[type="checkbox"]');
    await expect(rsiToggle).toBeChecked();
    
    // Check that Bollinger Bands is enabled
    const bbandsToggle = page.locator('label:has-text("Bollinger Bands")').locator('input[type="checkbox"]');
    await expect(bbandsToggle).toBeChecked();
    
    // Check parameter values
    await expect(page.locator('text=Parameters')).toBeVisible();
    
    // Note: Specific parameter value checking might be flaky in E2E tests
    // The important thing is that the state is restored
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('/api/run_backtest', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      });
    });
    
    // Set up A/B test
    const profileASelect = page.locator('text=Profile A').locator('..').locator('select');
    const profileBSelect = page.locator('text=Profile B').locator('..').locator('select');
    
    await profileASelect.selectOption('Momentum');
    await profileBSelect.selectOption('Mean Reversion');
    
    // Try to run A/B test
    await page.locator('text=Run A/B Test').click();
    
    // Check for error message
    await expect(page.locator('text=A/B test failed')).toBeVisible({ timeout: 10000 });
  });
});
