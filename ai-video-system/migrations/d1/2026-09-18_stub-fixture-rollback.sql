-- ROLLBACK for the 2026-09-18 stub-job correction.
-- Restores the exact pre-correction state of the three Big Buck Bunny
-- dev-stub fixture rows in video_jobs. Apply with:
--   npx wrangler d1 execute <db> --remote --file=stub_rollback.sql
UPDATE video_jobs SET status='delivered', delivered_at='2026-05-07T02:22:19.561Z', error=NULL, r2_url='https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4' WHERE id='vj_mouv1m69_6c2f14a182c5ec39';
UPDATE video_jobs SET status='delivered', delivered_at='2026-05-07T02:29:57.256Z', error=NULL, r2_url='https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4' WHERE id='vj_mouvbcfn_6421407a920657e4';
UPDATE video_jobs SET status='delivered', delivered_at='2026-05-07T02:47:01.989Z', error=NULL, r2_url='https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4' WHERE id='vj_mouvx77u_4921c4863e4ef9e7';
-- also restores the stub stream_uid / hosted_url cleared in the same pass
UPDATE video_jobs SET stream_uid='stub-vj_mouv1m69_6c2f14a182c5ec39', hosted_url='https://ai-video-system-staging.lehr007.workers.dev/v/stub-vj_mouv1m69_6c2f14a182c5ec39' WHERE id='vj_mouv1m69_6c2f14a182c5ec39';
UPDATE video_jobs SET stream_uid='stub-vj_mouvbcfn_6421407a920657e4', hosted_url='https://ai-video-system-staging.lehr007.workers.dev/v/stub-vj_mouvbcfn_6421407a920657e4' WHERE id='vj_mouvbcfn_6421407a920657e4';
UPDATE video_jobs SET stream_uid='stub-vj_mouvx77u_4921c4863e4ef9e7', hosted_url='https://ai-video-system-staging.lehr007.workers.dev/v/stub-vj_mouvx77u_4921c4863e4ef9e7' WHERE id='vj_mouvx77u_4921c4863e4ef9e7';
