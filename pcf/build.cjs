// Build with telemetry disabled before Application Insights initializes.
// Statsbeat otherwise probes instance metadata even with PP telemetry opted out.
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [require.resolve('pcf-scripts/bin/pcf-scripts.js'), 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, PP_TOOLS_TELEMETRY_OPTOUT: 'true', APPLICATIONINSIGHTS_CONFIGURATION_CONTENT: JSON.stringify({ disableAppInsights: true, disableStatsbeat: true, disableAllExtendedMetrics: true, enableAutoCollectPerformance: false, enableAutoCollectDependencies: false, enableAutoCollectRequests: false }) },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
