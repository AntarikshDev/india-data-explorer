-- Geo dataset
CREATE TABLE public.geo_states (code text PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.geo_districts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), state_code text NOT NULL REFERENCES public.geo_states(code) ON DELETE CASCADE, name text NOT NULL, hq_lat numeric NOT NULL, hq_lng numeric NOT NULL, UNIQUE(state_code, name));
CREATE TABLE public.geo_localities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), district_id uuid NOT NULL REFERENCES public.geo_districts(id) ON DELETE CASCADE, name text NOT NULL, kind text NOT NULL DEFAULT 'area');
CREATE INDEX idx_geo_districts_state ON public.geo_districts(state_code);
CREATE INDEX idx_geo_localities_district ON public.geo_localities(district_id);
ALTER TABLE public.geo_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_localities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo states readable" ON public.geo_states FOR SELECT TO authenticated USING (true);
CREATE POLICY "geo districts readable" ON public.geo_districts FOR SELECT TO authenticated USING (true);
CREATE POLICY "geo localities readable" ON public.geo_localities FOR SELECT TO authenticated USING (true);

INSERT INTO public.geo_states (code,name) VALUES ('AP','Andhra Pradesh'),('AR','Arunachal Pradesh'),('AS','Assam'),('BR','Bihar'),('CG','Chhattisgarh'),('GA','Goa'),('GJ','Gujarat'),('HR','Haryana'),('HP','Himachal Pradesh'),('JH','Jharkhand'),('KA','Karnataka'),('KL','Kerala'),('MP','Madhya Pradesh'),('MH','Maharashtra'),('MN','Manipur'),('ML','Meghalaya'),('MZ','Mizoram'),('NL','Nagaland'),('OD','Odisha'),('PB','Punjab'),('RJ','Rajasthan'),('SK','Sikkim'),('TN','Tamil Nadu'),('TG','Telangana'),('TR','Tripura'),('UP','Uttar Pradesh'),('UK','Uttarakhand'),('WB','West Bengal'),('AN','Andaman and Nicobar Islands'),('CH','Chandigarh'),('DN','Dadra and Nagar Haveli and Daman and Diu'),('DL','Delhi'),('JK','Jammu and Kashmir'),('LA','Ladakh'),('LD','Lakshadweep'),('PY','Puducherry');

INSERT INTO public.geo_districts (state_code,name,hq_lat,hq_lng) VALUES ('UP','Agra',27.1767,78.0081),('UP','Aligarh',27.8974,78.088),('UP','Ambedkar Nagar',26.4282,82.7022),('UP','Amethi',26.1543,81.8104),('UP','Amroha',28.9,78.4667),('UP','Auraiya',26.4658,79.5108),('UP','Ayodhya',26.799,82.2042),('UP','Azamgarh',26.0686,83.1836),('UP','Baghpat',28.9447,77.2197),('UP','Bahraich',27.5743,81.5942),('UP','Ballia',25.7563,84.1471),('UP','Balrampur',27.4314,82.1858),('UP','Banda',25.4769,80.3367),('UP','Barabanki',26.9279,81.1846),('UP','Bareilly',28.367,79.4304),('UP','Basti',26.8141,82.7459),('UP','Bhadohi',25.3946,82.5719),('UP','Bijnor',29.3724,78.134),('UP','Budaun',28.0382,79.1281),('UP','Bulandshahr',28.4069,77.8497),('UP','Chandauli',25.2604,83.268),('UP','Chitrakoot',25.2,80.9),('UP','Deoria',26.5024,83.7791),('UP','Etah',27.5635,78.6644),('UP','Etawah',26.7752,79.015),('UP','Farrukhabad',27.3895,79.58),('UP','Fatehpur',25.9285,80.8132),('UP','Firozabad',27.1592,78.3957),('UP','Gautam Buddha Nagar',28.5355,77.391),('UP','Ghaziabad',28.6692,77.4538),('UP','Ghazipur',25.5824,83.5778),('UP','Gonda',27.1336,81.961),('UP','Gorakhpur',26.7606,83.3732),('UP','Hamirpur',25.9523,80.1497),('UP','Hapur',28.7299,77.7811),('UP','Hardoi',27.3956,80.1318),('UP','Hathras',27.5957,78.0506),('UP','Jalaun',26.1483,79.3322),('UP','Jaunpur',25.7539,82.6831),('UP','Jhansi',25.4484,78.5685),('UP','Kannauj',27.0552,79.9189),('UP','Kanpur Dehat',26.4143,79.9505),('UP','Kanpur Nagar',26.4499,80.3319),('UP','Kasganj',27.8094,78.6442),('UP','Kaushambi',25.5374,81.3877),('UP','Kheri',27.9085,80.7795),('UP','Kushinagar',26.74,83.89),('UP','Lalitpur',24.6886,78.4124),('UP','Lucknow',26.8467,80.9462),('UP','Maharajganj',27.1444,83.5667),('UP','Mahoba',25.292,79.8736),('UP','Mainpuri',27.235,79.026),('UP','Mathura',27.4924,77.6737),('UP','Mau',25.9417,83.5611),('UP','Meerut',28.9845,77.7064),('UP','Mirzapur',25.1449,82.5689),('UP','Moradabad',28.8389,78.7768),('UP','Muzaffarnagar',29.4727,77.7085),('UP','Pilibhit',28.631,79.804),('UP','Pratapgarh',25.8973,81.943),('UP','Prayagraj',25.4358,81.8463),('UP','Raebareli',26.2309,81.2331),('UP','Rampur',28.8085,79.025),('UP','Saharanpur',29.968,77.5452),('UP','Sambhal',28.5847,78.5681),('UP','Sant Kabir Nagar',26.7763,83.05),('UP','Shahjahanpur',27.883,79.912),('UP','Shamli',29.45,77.3167),('UP','Shravasti',27.5167,82.05),('UP','Siddharthnagar',27.2828,83.0883),('UP','Sitapur',27.568,80.6824),('UP','Sonbhadra',24.6857,83.0681),('UP','Sultanpur',26.2647,82.0726),('UP','Unnao',26.5464,80.4879),('UP','Varanasi',25.3176,82.9739),('DL','New Delhi',28.6139,77.209),('DL','North Delhi',28.7041,77.1025),('DL','South Delhi',28.5355,77.249),('DL','East Delhi',28.6304,77.296),('DL','West Delhi',28.6519,77.0767),('HR','Gurugram',28.4595,77.0266),('HR','Faridabad',28.4089,77.3178),('HR','Sonipat',28.9931,77.0151),('HR','Panipat',29.3909,76.9635),('HR','Karnal',29.6857,76.9905),('HR','Rohtak',28.8955,76.6066),('HR','Hisar',29.1492,75.7217),('HR','Ambala',30.3782,76.7767),('UK','Dehradun',30.3165,78.0322),('UK','Haridwar',29.9457,78.1642),('UK','Nainital',29.3919,79.4542),('UK','Udham Singh Nagar',28.974,79.4014),('BR','Patna',25.5941,85.1376),('BR','Gaya',24.7914,85.0002),('BR','Muzaffarpur',26.1209,85.3647),('BR','Bhagalpur',25.2425,86.9842),('BR','Darbhanga',26.1542,85.8918),('RJ','Jaipur',26.9124,75.7873),('RJ','Jodhpur',26.2389,73.0243),('RJ','Udaipur',24.5854,73.7125),('RJ','Kota',25.2138,75.8648),('RJ','Ajmer',26.4499,74.6399),('MP','Bhopal',23.2599,77.4126),('MP','Indore',22.7196,75.8577),('MP','Gwalior',26.2183,78.1828),('MP','Jabalpur',23.1815,79.9864),('MH','Mumbai',19.076,72.8777),('MH','Pune',18.5204,73.8567),('MH','Nagpur',21.1458,79.0882),('MH','Nashik',19.9975,73.7898),('MH','Thane',19.2183,72.9781),('KA','Bengaluru Urban',12.9716,77.5946),('KA','Mysuru',12.2958,76.6394),('KA','Mangaluru',12.9141,74.856),('TN','Chennai',13.0827,80.2707),('TN','Coimbatore',11.0168,76.9558),('TN','Madurai',9.9252,78.1198),('TG','Hyderabad',17.385,78.4867),('TG','Warangal',17.9689,79.5941),('GJ','Ahmedabad',23.0225,72.5714),('GJ','Surat',21.1702,72.8311),('GJ','Vadodara',22.3072,73.1812),('GJ','Rajkot',22.3039,70.8022),('PB','Ludhiana',30.901,75.8573),('PB','Amritsar',31.634,74.8723),('PB','Jalandhar',31.326,75.5762),('PB','Mohali',30.7046,76.7179),('WB','Kolkata',22.5726,88.3639),('WB','Howrah',22.5958,88.2636),('WB','Darjeeling',27.036,88.2627),('CH','Chandigarh',30.7333,76.7794),('JK','Srinagar',34.0837,74.7973),('JK','Jammu',32.7266,74.857),('KL','Thiruvananthapuram',8.5241,76.9366),('KL','Kochi',9.9312,76.2673),('KL','Kozhikode',11.2588,75.7804),('OD','Bhubaneswar',20.2961,85.8245),('OD','Cuttack',20.4625,85.8828),('AP','Visakhapatnam',17.6868,83.2185),('AP','Vijayawada',16.5062,80.648),('JH','Ranchi',23.3441,85.3096),('JH','Jamshedpur',22.8046,86.2029),('CG','Raipur',21.2514,81.6296),('AS','Guwahati',26.1445,91.7362),('GA','Panaji',15.4909,73.8278),('HP','Shimla',31.1048,77.1734);

INSERT INTO public.geo_localities (district_id, name, kind)
SELECT d.id, l.name, l.kind FROM public.geo_districts d
JOIN (VALUES
  ('UP','Gautam Buddha Nagar','Sector 15, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 18, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 22, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 27, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 34, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 37, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 44, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 50, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 51, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 52, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 55, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 61, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 62, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 63, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 71, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 75, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 76, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 77, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 78, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 93, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 104, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 107, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 110, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 121, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 122, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 128, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 135, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 137, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 142, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 143, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 150, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Sector 168, Noida','sector'),
  ('UP','Gautam Buddha Nagar','Alpha 1, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Alpha 2, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Beta 1, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Beta 2, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Gamma 1, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Gamma 2, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Knowledge Park 1, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Knowledge Park 2, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Knowledge Park 3, Greater Noida','area'),
  ('UP','Gautam Buddha Nagar','Pari Chowk, Greater Noida','area'),
  ('UP','Lucknow','Hazratganj, Lucknow','area'),
  ('UP','Lucknow','Gomti Nagar, Lucknow','area'),
  ('UP','Lucknow','Aliganj, Lucknow','area'),
  ('UP','Lucknow','Indira Nagar, Lucknow','area'),
  ('UP','Lucknow','Aminabad, Lucknow','area'),
  ('UP','Lucknow','Chowk, Lucknow','area'),
  ('UP','Lucknow','Alambagh, Lucknow','area'),
  ('UP','Lucknow','Mahanagar, Lucknow','area'),
  ('UP','Ghaziabad','Indirapuram, Ghaziabad','area'),
  ('UP','Ghaziabad','Vaishali, Ghaziabad','area'),
  ('UP','Ghaziabad','Vasundhara, Ghaziabad','area'),
  ('UP','Ghaziabad','Kaushambi, Ghaziabad','area'),
  ('UP','Ghaziabad','Raj Nagar, Ghaziabad','area'),
  ('UP','Ghaziabad','Crossings Republik, Ghaziabad','area')
) AS l(state_code, district_name, name, kind)
ON d.state_code = l.state_code AND d.name = l.district_name;

-- Lead scoring + enrichment
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email_enriched text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score_reasons jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS listing_url text;
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);