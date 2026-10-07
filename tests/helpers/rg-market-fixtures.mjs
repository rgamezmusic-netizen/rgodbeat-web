// Locked V1 contract fixtures. Production pricing is read from rg_market_products.
export const marketRows = [
 ['mp3_25','25% MP3 Ticket',2500,'discount','mp3',25,725,null],
 ['wav_25','25% WAV Ticket',4500,'discount','wav',25,1225,null],
 ['mp3_50','50% MP3 Ticket',5000,'discount','mp3',50,1450,null],
 ['wav_50','50% WAV Ticket',8500,'discount','wav',50,2450,null],
 ['beat_pass','RG Beat Pass',10000,'beat','mp3',null,2900,null],
 ['studio_30','RG Studio Pass / 30 days',3500,'studio','studio',null,1000,30],
].map(([product_key,name,cost_rg,benefit_kind,allowed_category,percentage,maximum_benefit_cents,studio_days])=>({product_key,name,cost_rg,benefit_kind,allowed_category,percentage,maximum_benefit_cents,studio_days,
 version:1,section:benefit_kind==='studio'?'studio':'beats',eligibility:'Verified eligible benefit',one_time:true,expiration_policy:'never',giftable:true,active:product_key==='beat_pass'}));
export const marketProducts = marketRows.map(r=>({productKey:r.product_key,version:r.version,name:r.name,costRg:r.cost_rg,benefitKind:r.benefit_kind,allowedCategory:r.allowed_category,
 percentage:r.percentage,maximumBenefitCents:r.maximum_benefit_cents,studioDays:r.studio_days,section:r.section,eligibility:r.eligibility,oneTime:true,expirationPolicy:'never',giftable:true,active:r.active}));
