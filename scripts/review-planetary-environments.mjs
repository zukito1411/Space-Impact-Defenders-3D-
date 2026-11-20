// Reuse the actual campaign UI and controlled native workloads.
process.env.RAID_REVIEW_STAGES ??= '5,10'
process.env.RAID_REVIEW_OUTPUT ??= 'presentation-review/planetary-plains-v1'
await import('./review-raid-campaign-browser.mjs')
