// routes/admin-reports.js
// Phase 8: Automated weekly performance reports

export async function handleWeeklyReport(request, env) {
    if (request.method !== 'GET') {
          return new Response('Method not allowed', { status: 405 });
        }

    try {
          const authHeader = request.headers.get('Authorization') || '';
          const token = authHeader.replace('Bearer ', '');

          if (!token || token !== env.ADMIN_TOKEN) {
                  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                            status: 401,
                            headers: { 'Content-Type': 'application/json' },
                          });
                }

          const days = parseInt(new URL(request.url).searchParams.get('days') || '7', 10);

          const today = new Date();
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - days);

          const list = await env.VIDEO_KV.list({ prefix: 'job:', limit: 10000 });

          const jobs = [];
          for (const key of list.keys) {
                  const jobData = await env.VIDEO_KV.get(key.name, 'json');
                  if (jobData && new Date(jobData.created_at) >= startDate) {
                            jobs.push(jobData);
                          }
                }

          const dailyMetrics = {};
          const videoTypeStats = {};
          let totalCreditsUsed = 0;
          let totalSuccessful = 0;
          let totalFailed = 0;

          jobs.forEach(job => {
                  const date = new Date(job.created_at).toISOString().split('T')[0];

                  if (!dailyMetrics[date]) {
                            dailyMetrics[date] = {
                                        renders: 0,
                                        delivered: 0,
                                        failed: 0,
                                        credits_used: 0,
                                      };
                          }
                  dailyMetrics[date].renders++;

                  const estimatedCredits = job.video_duration_seconds ? 
                    (job.video_duration_seconds / 60) * 3 : 3;
                  dailyMetrics[date].credits_used += estimatedCredits;
                  totalCreditsUsed += estimatedCredits;

                  if (!videoTypeStats[job.video_type]) {
                            videoTypeStats[job.video_type] = {
                                        count: 0,
                                        successful: 0,
                                        failed: 0,
                                        avg_credits: 0,
                                        total_credits: 0,
                                      };
                          }
                  videoTypeStats[job.video_type].count++;
                  videoTypeStats[job.video_type].total_credits += estimatedCredits;

                  if (job.delivery_status === 'delivered') {
                            dailyMetrics[date].delivered++;
                            videoTypeStats[job.video_type].successful++;
                            totalSuccessful++;
                          } else if (job.delivery_status === 'failed') {
                            dailyMetrics[date].failed++;
                            videoTypeStats[job.video_type].failed++;
                            totalFailed++;
                          }
                });

          Object.values(videoTypeStats).forEach(stats => {
                  stats.avg_credits = (stats.total_credits / stats.count).toFixed(2);
                });

          const successRate = totalSuccessful + totalFailed > 0 ?
            (totalSuccessful / (totalSuccessful + totalFailed)) * 100 : 0;

          const reportData = {
                  report_period: {
                            start_date: startDate.toISOString().split('T')[0],
                            end_date: today.toISOString().split('T')[0],
                            days: days,
                          },
                  summary_metrics: {
                            total_renders: jobs.length,
                            successful_deliveries: totalSuccessful,
                            failed_deliveries: totalFailed,
                            success_rate: successRate.toFixed(2) + '%',
                            total_credits_estimated: Math.round(totalCreditsUsed),
                            avg_credits_per_render: (totalCreditsUsed / (jobs.length || 1)).toFixed(2),
                          },
                  daily_breakdown: dailyMetrics,
                  video_type_performance: videoTypeStats,
                  top_performing_type: Object.entries(videoTypeStats)
                    .sort((a, b) => b[1].successful - a[1].successful)[0]?.[0] || 'N/A',
                  generated_at: new Date().toISOString(),
                };

          return new Response(JSON.stringify(reportData, null, 2), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                });
        } catch (error) {
          console.error('Weekly report error:', error);
          return new Response(JSON.stringify({ error: error.message }), {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' },
                });
        }
  }
