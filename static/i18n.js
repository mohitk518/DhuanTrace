// Hindi / English switch for the whole page. The page is written in English; in Hindi mode every text node and
// label that matches the dictionary (exactly, or through a pattern for text with numbers) is swapped, including
// text the app adds later. Switching back restores the original English. Names of data sources stay in English.
(() => {
  const HI = {
    // header, tour
    'Finds the farm fires satellites miss after 4 p.m., traces whose smoke is reaching your city, and drafts the alert for the district that can act.': 'शाम 4 बजे के बाद की वो खेत की आग खोजता है जो सैटेलाइट से छूट जाती है, पता लगाता है कि आपके शहर तक किसका धुआँ पहुँच रहा है, और उस ज़िले के लिए अलर्ट लिखता है जो कार्रवाई कर सकता है।',
    '▶ 60-second tour': '▶ 60 सेकंड का टूर', 'Back': 'पीछे', 'Pause': 'रोकें', 'Play': 'चलाएँ', 'Next': 'आगे', 'End tour': 'टूर बंद करें',
    // map
    'Fires, smoke paths and air quality ·': 'आग, धुएँ के रास्ते और हवा की गुणवत्ता ·', 'Madhya Pradesh': 'मध्य प्रदेश',
    'Fires': 'आग', 'Last 24 h': 'पिछले 24 घंटे', 'Last 48 h': 'पिछले 48 घंटे', 'Smoke paths': 'धुएँ के रास्ते', 'CPCB stations': 'CPCB स्टेशन',
    'Hidden hotspots': 'छिपे हॉटस्पॉट', 'Citizen sensors': 'नागरिक सेंसर', 'Corridors': 'कॉरिडोर', 'Satellite image': 'सैटेलाइट तस्वीर',
    '▶ Replay 48 h': '▶ 48 घंटे का रीप्ले', '❚❚ Pause': '❚❚ रोकें', 'Now': 'अभी', 'Back to now': 'अभी पर लौटें',
    'Satellite fire detection': 'सैटेलाइट से दिखी आग', 'Citizen photo report': 'नागरिक की फ़ोटो रिपोर्ट', 'Where the air came from (36 h)': 'हवा कहाँ से आई (36 घंटे)',
    'Smoke path to the city': 'शहर तक धुएँ का रास्ता', 'Hidden hotspot': 'छिपा हॉटस्पॉट', 'Citizen sensor': 'नागरिक सेंसर', 'Industrial corridor': 'औद्योगिक कॉरिडोर',
    'Analyse air here': 'यहाँ की हवा जाँचें', 'Report smoke here': 'यहाँ धुएँ की रिपोर्ट करें',
    // analysis
    'Analyse a city': 'शहर की जाँच', 'or click any spot on the map': 'या नक्शे पर कहीं भी क्लिक करें', 'Custom spot (from map)': 'नक्शे से चुनी जगह',
    'AQI now': 'अभी का AQI', 'Peak in next 24 h': 'अगले 24 घंटे में सबसे ज़्यादा', 'Farm-fire smoke now': 'अभी खेत की आग का धुआँ', 'AQI points added': 'AQI अंक जुड़े',
    'Smoke on the way': 'रास्ते में धुआँ', 'Whose fires are in this air': 'इस हवा में किसकी आग का धुआँ', 'AQI forecast': 'AQI पूर्वानुमान',
    'CAMS model (satellite fires only)': 'CAMS मॉडल (सिर्फ़ सैटेलाइट वाली आग)', 'Likely range (80%)': 'संभावित दायरा (80%)',
    'Shared city model (federated, live CPCB)': 'शहरों का साझा मॉडल (फ़ेडरेटेड, लाइव CPCB)', 'DhuanTrace (+ citizen-reported fires)': 'DhuanTrace (+ नागरिकों की बताई आग)',
    'No farm-fire smoke is reaching this place right now.': 'अभी इस जगह तक खेत की आग का धुआँ नहीं पहुँच रहा।',
    'CAMS model': 'CAMS मॉडल', 'fires in the next 24 h': 'अगले 24 घंटे में आग',
    // requirements
    'Track 02 problem statement → what DhuanTrace does → proof': 'Track 02 की समस्या → DhuanTrace क्या करता है → सबूत',
    'Every part of the problem statement, the features that meet it, a live check against this running app, and the automated tests that prove it. A test fails if any listed proof stops existing.': 'समस्या का हर हिस्सा, उसे पूरा करने वाले फ़ीचर, इस चलते ऐप पर लाइव जाँच, और उसे साबित करने वाले ऑटोमेटेड टेस्ट। कोई भी सबूत हटे तो टेस्ट फ़ेल हो जाता है।',
    'Track 02 asks for': 'Track 02 क्या माँगता है', 'What DhuanTrace does': 'DhuanTrace क्या करता है', 'Live check now': 'अभी की लाइव जाँच', 'Proof': 'सबूत', 'Show': 'दिखाएँ', 'Checking…': 'जाँच हो रही है…',
    // priorities
    'Stop these fires first · across': 'पहले ये आग रोकें ·', 'cities': 'शहरों के आधार पर',
    'Districts ranked by how many people breathe their smoke now or within 24 hours. Farmers mostly burn between 4 and 7 p.m., so teams sent before 4 p.m. can prevent the next round.': 'ज़िलों का क्रम इस पर है कि अभी या अगले 24 घंटे में कितने लोग उनका धुआँ साँस में ले रहे हैं। किसान ज़्यादातर शाम 4 से 7 बजे जलाते हैं, इसलिए 4 बजे से पहले भेजी गई टीमें अगला दौर रोक सकती हैं।',
    'District': 'ज़िला', 'People exposed': 'प्रभावित लोग', 'AQI added': 'जुड़ा AQI', 'Loading…': 'लोड हो रहा है…', 'Verify': 'जाँचें',
    'No farm-fire smoke is reaching any of these cities right now.': 'अभी इनमें से किसी शहर तक खेत की आग का धुआँ नहीं पहुँच रहा।',
    // ask
    'Ask DhuanTrace': 'DhuanTrace से पूछें', 'Ask': 'पूछें', 'e.g. Kal AQI kab sabse zyada hoga?': 'जैसे: कल AQI कब सबसे ज़्यादा होगा?',
    'Ask in Hindi, English or any of the listed languages. Answers use only the numbers on this page. The language follows the alert language picker below.': 'हिंदी, अंग्रेज़ी या सूची की किसी भी भाषा में पूछें। जवाब सिर्फ़ इस पेज के आँकड़ों से आते हैं। भाषा नीचे अलर्ट वाली भाषा से तय होती है।',
    'Thinking…': 'सोच रहा है…', 'Type or speak a question first.': 'पहले सवाल लिखें या बोलें।',
    // satellite check
    'Satellite check · Gemini reads the real image': 'सैटेलाइट जाँच · Gemini असली तस्वीर पढ़ता है',
    "Pulls NASA's true-colour VIIRS image over a fire cluster and asks Gemini whether the smoke drifts the way our wind model predicts. Yellow rings are satellite fire detections; the blue arrow is the model's smoke direction.": 'आग वाले इलाके की NASA की असली रंगीन VIIRS तस्वीर लेकर Gemini से पूछता है कि क्या धुआँ उसी दिशा में जा रहा है जैसा हमारा हवा का मॉडल बताता है। पीले घेरे सैटेलाइट से दिखी आग हैं; नीला तीर मॉडल के हिसाब से धुएँ की दिशा है।',
    'Check with satellite': 'सैटेलाइट से जाँचें', 'Pick a district and press Check with satellite.': 'ज़िला चुनें और "सैटेलाइट से जाँचें" दबाएँ।', 'Fetching the NASA image and asking Gemini…': 'NASA की तस्वीर ली जा रही है और Gemini से पूछा जा रहा है…',
    // accuracy
    'How accurate is this? · live check': 'यह कितना सही है? · लाइव जाँच', "The model's AQI at each CPCB station compared with what that station reports right now.": 'हर CPCB स्टेशन पर मॉडल का AQI, उस स्टेशन की अभी की रीडिंग से मिलाया गया।',
    'average error (AQI points)': 'औसत गलती (AQI अंक)', 'same CPCB category': 'वही CPCB श्रेणी', 'bias (model minus station)': 'झुकाव (मॉडल माइनस स्टेशन)',
    'Station': 'स्टेशन', 'Model': 'मॉडल', 'Diff': 'अंतर',
    // hotspots
    "Hidden hotspots · pollution the models can't explain": 'छिपे हॉटस्पॉट · वो प्रदूषण जिसे मॉडल नहीं समझा पाते',
    "Every CPCB station and citizen sensor is compared with what the CAMS model plus traced farm-fire smoke expects. Places far above the rest point to a local source: a factory, burning garbage, dust. Citizen reports, nearby industry and NASA's satellite layers for aerosol and NO₂ are added as evidence. In the satellite pictures the circle is the spot; the app compares it with the ring around it. These are daily daytime views of the whole air column, not ground readings.": 'हर CPCB स्टेशन और नागरिक सेंसर की रीडिंग को CAMS मॉडल और खेत की आग के धुएँ के अनुमान से मिलाया जाता है। जहाँ रीडिंग बाकी से बहुत ज़्यादा हो, वहाँ कोई स्थानीय स्रोत है: फ़ैक्टरी, कचरा जलना, धूल। नागरिक रिपोर्ट, पास का उद्योग और NASA की एयरोसोल व NO₂ सैटेलाइट परतें सबूत के तौर पर जोड़ी जाती हैं। सैटेलाइट तस्वीर में गोला वह जगह है; ऐप उसे आसपास के घेरे से मिलाता है। ये पूरे वायु-स्तंभ की दिन की तस्वीरें हैं, ज़मीन की रीडिंग नहीं।',
    'Checking every measuring point…': 'हर माप केंद्र की जाँच हो रही है…', 'More over the spot': 'जगह के ऊपर ज़्यादा', 'Slightly more': 'थोड़ा ज़्यादा', 'No local excess': 'कोई स्थानीय बढ़त नहीं', 'No clear view': 'साफ़ तस्वीर नहीं', 'Not reachable': 'पहुँच नहीं',
    'aerosol optical depth': 'एयरोसोल (धुंध के कण)', 'tropospheric NO₂ column': 'NO₂ गैस (निचला वायुमंडल)',
    // corridors
    'Economic corridors · next 48 hours': 'आर्थिक कॉरिडोर · अगले 48 घंटे',
    'The worst air along each industrial corridor, hour by hour, with an alert when it moves into a worse CPCB category or jumps by 50+ in six hours.': 'हर औद्योगिक कॉरिडोर पर घंटे-दर-घंटे सबसे खराब हवा; CPCB श्रेणी बिगड़ने या छह घंटे में 50+ बढ़ने पर अलर्ट।',
    'Forecasting corridors…': 'कॉरिडोर का पूर्वानुमान बन रहा है…',
    // ledger
    'Forecast ledger · written before, checked after': 'पूर्वानुमान बहीखाता · पहले लिखा, बाद में जाँचा',
    'Every hour the app writes down its forecast for 3, 6, 12 and 24 hours ahead, before that time comes. When it arrives, the forecast is checked against the CPCB reading. Nothing is filled in or changed afterwards.': 'हर घंटे ऐप 3, 6, 12 और 24 घंटे आगे का पूर्वानुमान उस समय के आने से पहले लिख लेता है। समय आने पर उसे CPCB रीडिंग से जाँचा जाता है। बाद में कुछ भी भरा या बदला नहीं जाता।',
    'DhuanTrace average error': 'DhuanTrace की औसत गलती', 'better than "stays the same"': '"जैसा है वैसा रहेगा" से बेहतर', 'readings inside the forecast range (goal 80%)': 'पूर्वानुमान दायरे में आई रीडिंग (लक्ष्य 80%)',
    'Ahead': 'आगे', 'Checked': 'जाँचे गए', 'Stays same': 'वैसा ही रहेगा', 'Right category': 'सही श्रेणी',
    // interstate
    'Smoke across state borders': 'राज्य सीमा पार धुआँ',
    'How much farm-fire smoke': 'खेत की आग का कितना धुआँ', 'receives from each neighbouring state, and how much of its smoke reaches big cities across the border. States can read this as an open bulletin at': 'को हर पड़ोसी राज्य से मिलता है, और इसका कितना धुआँ सीमा पार के बड़े शहरों तक पहुँचता है। राज्य इसे खुले बुलेटिन के रूप में यहाँ पढ़ सकते हैं:',
    'State': 'राज्य', 'Into this region': 'इस क्षेत्र में आया', 'From this region': 'इस क्षेत्र से गया',
    // federated
    'Cities learning together · federated model': 'शहर साथ सीखते हैं · फ़ेडरेटेड मॉडल',
    'Each city learns how far the CAMS forecast is off at its own CPCB stations and shares only its model weights, never its data. The average (FedAvg) corrects forecasts for every city, including ones without history.': 'हर शहर अपने CPCB स्टेशनों पर सीखता है कि CAMS पूर्वानुमान कितना गलत है, और सिर्फ़ अपने मॉडल के अंक साझा करता है, डेटा कभी नहीं। उनका औसत (FedAvg) हर शहर का पूर्वानुमान सुधारता है, उनका भी जिनके पास इतिहास नहीं।',
    'error with CAMS alone': 'सिर्फ़ CAMS से गलती', 'error with the shared model': 'साझा मॉडल से गलती', 'new city, never trained on': 'नया शहर, जिस पर ट्रेनिंग नहीं हुई',
    'City node': 'शहर नोड', 'Samples': 'नमूने', 'Own model': 'अपना मॉडल', 'Shared': 'साझा', 'Show simulation': 'सिमुलेशन दिखाएँ', 'Show live model': 'लाइव मॉडल दिखाएँ', 'Copy model for other states': 'दूसरे राज्यों के लिए मॉडल कॉपी करें',
    'Other states join by posting their weights to': 'दूसरे राज्य अपने अंक यहाँ भेजकर जुड़ते हैं:', '; the shared model is at': '; साझा मॉडल यहाँ है:',
    // federated network
    'Federated network · separate nodes that share only weights': 'फ़ेडरेटेड नेटवर्क · अलग-अलग नोड जो सिर्फ़ अंक साझा करते हैं',
    "Four separate programs, each with its own process, port and memory, stand in for the regions and neighbouring states of this node (named in the table). Each keeps its own air-quality history. The coordinator sends out the shared model; each node trains on its own data and sends back five numbers. Every message is signed, and any reply carrying anything beyond the protocol's fields is refused.": 'चार अलग प्रोग्राम, हर एक का अपना प्रोसेस, पोर्ट और मेमोरी, इस नोड के क्षेत्रों और पड़ोसी राज्यों की जगह हैं (नाम तालिका में)। हर एक अपना हवा का इतिहास रखता है। कोऑर्डिनेटर साझा मॉडल भेजता है; हर नोड अपने डेटा पर सीखकर सिर्फ़ पाँच अंक लौटाता है। हर संदेश पर हस्ताक्षर होते हैं, और प्रोटोकॉल से बाहर का कुछ भी भेजने वाला जवाब ठुकरा दिया जाता है।',
    'Real deployment: run': 'असली इस्तेमाल: हर राज्य के सर्वर पर', "on each state's server with": 'चलाएँ, साथ में', 'and a shared': 'और एक साझा', ', and list their addresses in': ', और उनके पते यहाँ लिखें:', '. Protocol:': '। प्रोटोकॉल:',
    'Start 4 nodes and train': '4 नोड चलाएँ और सिखाएँ', 'messages over the network': 'नेटवर्क पर संदेश', 'raw data rows received by the coordinator': 'कोऑर्डिनेटर को मिली कच्चे डेटा की पंक्तियाँ',
    'error for a node that never trained (CAMS alone in brackets)': 'कभी न सीखे नोड की गलती (कोष्ठक में सिर्फ़ CAMS)', 'Node': 'नोड', 'Process': 'प्रोसेस', 'Rows kept at node': 'नोड पर रखी पंक्तियाँ',
    'Alone': 'अकेले', 'Shared + own tuning': 'साझा + अपनी ट्यूनिंग', 'As a new member': 'नए सदस्य के रूप में', 'What each node printed': 'हर नोड ने क्या लिखा',
    'Starting 4 node processes and training over the network…': '4 नोड प्रोसेस शुरू हो रहे हैं और नेटवर्क पर ट्रेनिंग हो रही है…', 'Done.': 'हो गया।',
    // alert log
    'Alert log · from draft to result': 'अलर्ट लॉग · मसौदे से नतीजे तक',
    'Saved alerts move from drafted to resolved. Six hours after action, the app compares the AQI change with the change the model expected from weather alone.': 'सहेजे अलर्ट "मसौदा" से "सुलझा" तक जाते हैं। कार्रवाई के छह घंटे बाद ऐप AQI के बदलाव को उस बदलाव से मिलाता है जो सिर्फ़ मौसम से होना था।',
    'No alerts saved yet. Draft one below and press Save to alert log.': 'अभी कोई अलर्ट सहेजा नहीं गया। नीचे मसौदा बनाएँ और "अलर्ट लॉग में सहेजें" दबाएँ।',
    // report
    'Report smoke or burning': 'धुएँ या जलाने की रिपोर्ट करें', 'Use my location': 'मेरी लोकेशन लें', 'Send report': 'रिपोर्ट भेजें', 'Location: click the map': 'लोकेशन: नक्शे पर क्लिक करें',
    'Gemini reads the photo, names the smoke source and adds it to the map. Evening reports fill the gap the satellites leave.': 'Gemini फ़ोटो पढ़कर धुएँ का स्रोत बताता है और उसे नक्शे पर जोड़ता है। शाम की रिपोर्ट वो कमी भरती हैं जो सैटेलाइट छोड़ देते हैं।',
    'Send a sensor reading': 'सेंसर रीडिंग भेजें', 'Have a low-cost PM2.5 meter? Enter its reading. It uses the location above and is calibrated against the nearest CPCB station.': 'क्या आपके पास सस्ता PM2.5 मीटर है? उसकी रीडिंग डालें। ऊपर की लोकेशन ली जाएगी और सबसे पास के CPCB स्टेशन से मिलान किया जाएगा।',
    'Device name, e.g. my-meter-1': 'डिवाइस का नाम, जैसे my-meter-1', 'PM10 (optional)': 'PM10 (वैकल्पिक)', 'Send reading': 'रीडिंग भेजें',
    'Attach a photo first.': 'पहले फ़ोटो लगाएँ।', 'Gemini is reading the photo…': 'Gemini फ़ोटो पढ़ रहा है…', 'Finding your location…': 'आपकी लोकेशन खोजी जा रही है…',
    'Location set. Attach a photo and send.': 'लोकेशन तय हो गई। फ़ोटो लगाकर भेजें।', 'Location was not shared. Click the map to set it instead.': 'लोकेशन नहीं मिली। उसकी जगह नक्शे पर क्लिक करें।',
    'This browser cannot share location. Click the map instead.': 'यह ब्राउज़र लोकेशन नहीं दे सकता। नक्शे पर क्लिक करें।',
    'Set the location first: click the map and choose Report smoke here, or use your location.': 'पहले लोकेशन तय करें: नक्शे पर क्लिक करके "यहाँ धुएँ की रिपोर्ट करें" चुनें, या अपनी लोकेशन लें।',
    'Set the location: click the map and choose Report smoke here, or use your location.': 'लोकेशन तय करें: नक्शे पर क्लिक करके "यहाँ धुएँ की रिपोर्ट करें" चुनें, या अपनी लोकेशन लें।',
    // alert
    'Alert for authorities': 'अधिकारियों के लिए अलर्ट', 'Draft alert': 'अलर्ट बनाएँ', 'Drafting…': 'बन रहा है…',
    'Choose a language and press Draft alert. Gemini writes it using only the numbers shown on this page.': 'भाषा चुनें और "अलर्ट बनाएँ" दबाएँ। Gemini सिर्फ़ इस पेज के आँकड़ों से लिखता है।',
    '🔒 Your photo and its rough location (about 1 km) appear on the public map. No name or phone number is asked or stored. Please keep faces and vehicle number plates out of the photo.': '🔒 आपकी फ़ोटो और उसकी अनुमानित जगह (लगभग 1 किमी) सार्वजनिक नक्शे पर दिखेगी। नाम या फ़ोन नंबर न माँगा जाता है, न रखा जाता है। कृपया फ़ोटो में चेहरे और गाड़ी के नंबर न आने दें।',
    'This is a draft for an official to check and send. DhuanTrace never sends an alert by itself, and it names districts, never farmers.': 'यह एक मसौदा है, जिसे अधिकारी जाँचकर भेजें। DhuanTrace खुद कभी अलर्ट नहीं भेजता, और ज़िलों का नाम लेता है, किसानों का कभी नहीं।',
    'When do the satellites look? · fire detections by hour, last 48 h': 'सैटेलाइट कब देखते हैं? · घंटेवार आग, पिछले 48 घंटे', 'Burning window 4–8 p.m.': 'जलाने का समय शाम 4–8', '4–8 p.m.': 'शाम 4–8', 'Table': 'तालिका', 'Hour (IST)': 'घंटा (IST)', 'Detections': 'आग',
    'came from the two satellite passes around 1:30 a.m. and 1:30 p.m. Between 4 and 8 p.m., when most farmers burn, there were': 'दो सैटेलाइट दौरों (रात 1:30 और दोपहर 1:30 के आसपास) से आईं। शाम 4 से 8 बजे के बीच, जब ज़्यादातर किसान जलाते हैं, सिर्फ़',
    'came from the two satellite passes around 1:30 a.m. and 1:30 p.m. Between 4 and 8 p.m., when most farmers burn, there was': 'दो सैटेलाइट दौरों (रात 1:30 और दोपहर 1:30 के आसपास) से आईं। शाम 4 से 8 बजे के बीच, जब ज़्यादातर किसान जलाते हैं, सिर्फ़',
    '. Those evening fires are the ones citizen photos add.': ' आग दिखी। शाम की यही आग नागरिकों की फ़ोटो जोड़ती हैं।',
    '. Those evening fires are the ones citizen photos add. (Sample fire data: add FIRMS_MAP_KEY for the live picture.)': ' आग दिखी। शाम की यही आग नागरिकों की फ़ोटो जोड़ती हैं। (नमूना डेटा: असली तस्वीर के लिए FIRMS_MAP_KEY लगाएँ।)',
    'Copy': 'कॉपी', 'Copied': 'कॉपी हो गया', 'Save to alert log': 'अलर्ट लॉग में सहेजें', 'Saved to the alert log. Mark it sent once you have sent it.': 'अलर्ट लॉग में सहेज दिया। भेजने के बाद इसे "भेजा गया" करें।',
    // packet, system
    'Shared forecast packet': 'साझा पूर्वानुमान पैकेट', 'Copy JSON': 'JSON कॉपी करें',
    "Each city node publishes its forecast and fire attribution in one open JSON format, so neighbouring cities and states can load each other's results. Machine endpoint:": 'हर शहर अपना पूर्वानुमान और आग का हिसाब एक खुले JSON फ़ॉर्मेट में छापता है, ताकि पड़ोसी शहर और राज्य एक-दूसरे के नतीजे ले सकें। मशीन पता:',
    'System health · is every part working right now?': 'सिस्टम की सेहत · क्या हर हिस्सा अभी काम कर रहा है?',
    'Each data source says whether it is live or on labelled sample data, and why. Request counts and response times are measured by the server itself. API reference:': 'हर डेटा स्रोत बताता है कि वो लाइव है या नमूना डेटा पर, और क्यों। अनुरोधों की गिनती और जवाब का समय सर्वर खुद नापता है। API संदर्भ:',
    'Source': 'स्रोत', 'Detail': 'विवरण', 'running for': 'कब से चल रहा', 'requests served': 'अनुरोध पूरे', 'server errors': 'सर्वर गलतियाँ', 'Busiest endpoints': 'सबसे व्यस्त एंडपॉइंट',
    'Calls': 'कॉल', 'Median': 'मध्य', 'Refused': 'ठुकराए', 'Refresh': 'ताज़ा करें', 'API docs': 'API दस्तावेज़',
    'Data:': 'डेटा:', 'Method:': 'तरीका:',
    'smoke from every fire and every citizen report is followed forward on the hourly wind field for 36 hours; paths passing within 30 km of a place count toward it. AQI uses CPCB NAQI breakpoints. Screening-level estimates for decision support, not an official forecast.': 'हर आग और हर नागरिक रिपोर्ट का धुआँ घंटेवार हवा के साथ 36 घंटे आगे तक देखा जाता है; जो रास्ते किसी जगह से 30 किमी के अंदर से गुज़रें, वो उसमें गिने जाते हैं। AQI, CPCB NAQI मानकों से। ये फ़ैसले में मदद के अनुमान हैं, आधिकारिक पूर्वानुमान नहीं।',
    // categories and chips
    'Good': 'अच्छा', 'Satisfactory': 'संतोषजनक', 'Moderate': 'मध्यम', 'Poor': 'खराब', 'Very poor': 'बहुत खराब', 'Severe': 'गंभीर',
    'live': 'लाइव', 'sample': 'नमूना', 'error': 'गड़बड़ी', 'now': 'अभी',
    // aria labels
    'Data source status': 'डेटा स्रोत की स्थिति', 'Guided tour': 'गाइडेड टूर', 'Map': 'नक्शा', 'Map. Click anywhere to analyse the air there or to report smoke.': 'नक्शा। कहीं भी क्लिक करके वहाँ की हवा जाँचें या धुएँ की रिपोर्ट करें।',
    'City': 'शहर', 'Question': 'सवाल', 'Speak your question': 'अपना सवाल बोलें', 'Photo': 'फ़ोटो', 'Language': 'भाषा', 'Report location': 'रिपोर्ट की लोकेशन', 'Device name': 'डिवाइस का नाम',
  };
  // Tour captions (set by the page as the tour moves)
  Object.assign(HI, {
    'Built for Track 02, line by line': 'Track 02 के लिए, लाइन-दर-लाइन',
    'Each part of the problem statement, what DhuanTrace does for it, a live check against this running app, and the tests that prove it.': 'समस्या का हर हिस्सा, DhuanTrace उसके लिए क्या करता है, इस ऐप पर लाइव जाँच, और उसे साबित करने वाले टेस्ट।',
    'Satellite, weather and citizen data on one map': 'सैटेलाइट, मौसम और नागरिक डेटा एक नक्शे पर',
    'NASA fire detections, CPCB stations, hourly wind and citizen photo reports. Satellites pass at 1:30 p.m.; most farm fires burn after 4 p.m. Citizen photos fill that gap.': 'NASA की आग, CPCB स्टेशन, घंटेवार हवा और नागरिकों की फ़ोटो रिपोर्ट। सैटेलाइट दोपहर 1:30 बजे गुज़रते हैं; ज़्यादातर खेत की आग 4 बजे के बाद जलती है। नागरिकों की फ़ोटो वो कमी भरती हैं।',
    "Whose smoke is in this city's air": 'इस शहर की हवा में किसका धुआँ',
    "Every fire's smoke is followed on the wind for 36 hours. The city sees which districts, and which neighbouring states, its farm-fire smoke comes from, and what share each has.": 'हर आग का धुआँ हवा के साथ 36 घंटे तक देखा जाता है। शहर देखता है कि उसका धुआँ किन ज़िलों और पड़ोसी राज्यों से आ रहा है, और हर एक का कितना हिस्सा है।',
    'AQI forecast with an honest range': 'AQI पूर्वानुमान, ईमानदार दायरे के साथ',
    'CAMS plus smoke from fires the model cannot see, with an 80% range from a wind ensemble and measured error.': 'CAMS, और उन आग का धुआँ जिन्हें मॉडल नहीं देख पाता, हवा के कई अनुमानों और मापी गई गलती से 80% दायरे के साथ।',
    'Hidden hotspots, with satellite evidence': 'छिपे हॉटस्पॉट, सैटेलाइट सबूत के साथ',
    "Readings the models cannot explain point to a local source. NASA's aerosol and NO₂ layers show whether the satellite also sees more pollution over the spot.": 'जो रीडिंग मॉडल नहीं समझा पाते, वो किसी स्थानीय स्रोत की ओर इशारा करती हैं। NASA की एयरोसोल और NO₂ परतें दिखाती हैं कि क्या सैटेलाइट को भी उस जगह ज़्यादा प्रदूषण दिखता है।',
    'Spikes along economic corridors': 'आर्थिक कॉरिडोर पर उछाल',
    'The worst air along six industrial corridors for 48 hours, with an alert on a category change or a 50-point jump.': 'छह औद्योगिक कॉरिडोर पर 48 घंटे तक सबसे खराब हवा, श्रेणी बदलने या 50 अंक उछलने पर अलर्ट।',
    'Accuracy, checked in public': 'सटीकता, सबके सामने जाँची हुई',
    'Every forecast is written down before its time and scored against CPCB after. Nothing is changed afterwards. Compared with CAMS and with "stays the same".': 'हर पूर्वानुमान समय से पहले लिखा जाता है और बाद में CPCB से जाँचा जाता है। बाद में कुछ नहीं बदलता। CAMS और "जैसा है वैसा रहेगा" से तुलना।',
    'Federated: states share models, not data': 'फ़ेडरेटेड: राज्य मॉडल साझा करते हैं, डेटा नहीं',
    'Four separate node programs train one model together. Only five numbers per node cross the network; the coordinator receives zero data rows.': 'चार अलग नोड प्रोग्राम मिलकर एक मॉडल सिखाते हैं। हर नोड से सिर्फ़ पाँच अंक नेटवर्क पर जाते हैं; कोऑर्डिनेटर को डेटा की शून्य पंक्तियाँ मिलती हैं।',
    'Alert to the authority that can act': 'कार्रवाई कर सकने वाले अधिकारी को अलर्ट',
    'Gemini drafts the alert for the Collector of the responsible district, in Hindi or 7 other languages, using only computed numbers. The alert log follows it to the result.': 'Gemini ज़िम्मेदार ज़िले के कलेक्टर के लिए हिंदी या 7 और भाषाओं में, सिर्फ़ गणना किए आँकड़ों से अलर्ट लिखता है। अलर्ट लॉग उसे नतीजे तक देखता है।',
    'Open for other cities and states': 'दूसरे शहरों और राज्यों के लिए खुला',
    'Smoke across state borders as an open bulletin, a JSON packet per city, and an OpenAPI description of every endpoint.': 'राज्य सीमा पार धुएँ का खुला बुलेटिन, हर शहर का JSON पैकेट, और हर एंडपॉइंट का OpenAPI विवरण।',
  });
  // Text with numbers or names in it
  const PATTERNS = [
    [/^Region pack: ([a-z0-9-]+) · (\d+) districts, (\d+) cities, (\d+) corridors(?: · also ready: (.+) \(one JSON file per state, see SCALING\.md\))?$/, (m) => `क्षेत्र पैक: ${m[1]} · ${m[2]} ज़िले, ${m[3]} शहर, ${m[4]} औद्योगिक कॉरिडोर` + (m[5] ? ` · तैयार: ${m[5]} (हर राज्य की एक JSON फ़ाइल, SCALING.md देखें)` : '')],
    // hotspots, corridors, notes
    [/^(.+?) · near (.+)$/, (m) => `${src(m[1])} · ${m[2]} के पास`],
    [/^Unexplained excess: \+(\d+) AQI points, ([\d.]+) times the typical spread across (\d+) measuring points\.$/, (m) => `बिना कारण की बढ़त: +${m[1]} AQI अंक, ${m[3]} माप केंद्रों के सामान्य फैलाव का ${m[2]} गुना।`],
    [/^(.+) is ([\d.]+) km away \(approximate location\)\.$/, (m) => `${m[1]} ${m[2]} किमी दूर है (अनुमानित जगह)।`],
    [/^(\d+) other measuring points? within 8 km also read high\.$/, (m) => `8 किमी के अंदर ${m[1]} और माप केंद्र भी ज़्यादा दिखा रहे हैं।`],
    [/^(\d+) satellite fire detections? within 10 km; their traced smoke is already subtracted\.$/, (m) => `10 किमी के अंदर ${m[1]} सैटेलाइट आग; उनका धुआँ पहले ही घटाया जा चुका है।`],
    [/^(\d+) citizen photo reports? within 10 km in the last 24 h show (.+)\.$/, (m) => `पिछले 24 घंटे में 10 किमी के अंदर ${m[1]} नागरिक फ़ोटो रिपोर्ट में दिखा: ${m[2].split(', ').map(src).join(', ')}।`],
    [/^🛰 Satellite check running in the background; it appears here within a few minutes\.$/, () => '🛰 सैटेलाइट जाँच पीछे चल रही है; कुछ मिनट में यहाँ दिखेगी।'],
    [/^(\d+) measuring points checked\. Typical gap between reading and model: (.+) ± (.+) AQI points\. Industrial area locations are approximate\.$/, (m) => `${m[1]} माप केंद्र जाँचे गए। रीडिंग और मॉडल का सामान्य अंतर: ${m[2]} ± ${m[3]} AQI अंक। औद्योगिक इलाकों की जगह अनुमानित है।`],
    [/^(.+): no category change expected in the next 48 h; peak (\d+) \((.+)\) near (.+)\.$/, (m) => `${m[1]}: अगले 48 घंटे में श्रेणी नहीं बदलेगी; सबसे ज़्यादा ${m[2]} (${HI[m[3]] || m[3]}) ${m[4]} के पास।`],
    [/^(.+): AQI expected to reach (\d+) \((.+)\) near (.+) around (.+), up from (\d+) now\.( Farm-fire smoke from (.+) adds to it\.)?$/, (m) => `${m[1]}: ${m[5]} के आसपास ${m[4]} के पास AQI ${m[2]} (${HI[m[3]] || m[3]}) तक पहुँचने का अनुमान, अभी ${m[6]} है।${m[8] ? ` ${m[8].replace(' and ', ' और ')} की खेत की आग का धुआँ इसे बढ़ाता है।` : ''}`],
    [/^Shaded band: the range the AQI falls in 8 times out of 10\. (.+)\.$/, (m) => `छायांकित पट्टी: वो दायरा जिसमें AQI 10 में से 8 बार रहता है। ${m[1] === "Range calibrated from this app's own scored forecasts" ? 'दायरा इस ऐप के अपने जाँचे गए पूर्वानुमानों से तय।' : 'जब तक 30+ पूर्वानुमान CPCB से नहीं जाँचे जाते, तब तक सामान्य दायरा।'}`],
    [/^(\d+) stations compared, (\d+)% within one CPCB category\.( .*)?$/, (m) => `${m[1]} स्टेशन मिलाए, ${m[2]}% एक CPCB श्रेणी के अंदर।${m[3] ? (/sample/.test(m[3]) ? ' स्टेशन की रीडिंग अभी नमूना है, इसलिए ये असली सटीकता जाँच नहीं है।' : ' स्टेशन की रीडिंग लाइव CPCB है।') : ''}`],
    [/^People exposed: (.+)\. Updated (.+) IST\.$/, (m) => `प्रभावित लोग: 2011 जनगणना की शहरी आबादी, अनुमानित। ${m[2]} IST पर अपडेट।`],
    [/^Not checked: (.+)\.$/, (m) => `जाँच नहीं हुई: ${{ 'Gemini is not connected': 'Gemini जुड़ा नहीं है', 'Gemini is busy right now': 'Gemini अभी व्यस्त है', 'Gemini could not answer': 'Gemini जवाब नहीं दे सका' }[m[1]] || m[1]}।`],
    [/^(\d+)% of (\d+) detections$/, (m) => `${m[2]} में से ${m[1]}% आग`],
    [/^(\d\d):00–\d\d:59 IST: (\d+) detections?$/, (m) => `${m[1]}:00 IST: ${m[2]} आग`],
    [/^fires, first smoke (.+)$/, (m) => `आग, पहला धुआँ ${m[1]}`],
    [/^peak (\d+)$/, (m) => `सबसे ज़्यादा ${m[1]}`],
    [/^(\d+) detections shown$/, (m) => `${m[1]} आग दिख रही हैं`],
    [/^(\d+) satellite · (\d+) citizen · ~(\d+) h travel$/, (m) => `${m[1]} सैटेलाइट · ${m[2]} नागरिक · ~${m[3]} घंटे का सफ़र`],
    [/^CPCB, (\d+) stations?$/, (m) => `CPCB, ${m[1]} स्टेशन`],
    [/^sample stations \(not live CPCB\), (\d+) stations?$/, (m) => `नमूना स्टेशन (लाइव CPCB नहीं), ${m[1]}`],
    [/^at (.+) IST · likely (\d+)–(\d+)$/, (m) => `${m[1]} IST पर · संभावित ${m[2]}–${m[3]}`],
    [/^at (.+) IST$/, (m) => `${m[1]} IST पर`],
    [/^(.+): (live|sample|error|off)$/, (m) => `${m[1]}: ${{ live: 'लाइव', sample: 'नमूना', error: 'गड़बड़ी', off: 'बंद' }[m[2]]}`],
    [/^(\d+) \/ (\d+)$/, (m) => m[0]],
    [/^Near (.+)$/, (m) => `${m[1]} के पास`],
    [/^(\d+) more$/, (m) => `${m[1]} और`],
    [/^(\d+) test groups$/, (m) => `${m[1]} टेस्ट समूह`],
  ];

  const SOURCES = { 'industrial emission (suspected)': 'औद्योगिक उत्सर्जन (संदिग्ध)', 'industrial emission': 'औद्योगिक उत्सर्जन', 'garbage burning': 'कचरा जलाना', 'construction dust': 'निर्माण की धूल', 'vehicle exhaust': 'वाहनों का धुआँ', 'crop residue burning': 'पराली जलाना', 'unknown local source': 'अज्ञात स्थानीय स्रोत' };
  const src = (t) => SOURCES[t] || t;
  Object.assign(HI, { 'Crop residue burning': 'पराली जलाना', 'Garbage burning': 'कचरा जलाना', 'Industrial emission': 'औद्योगिक उत्सर्जन', 'Construction dust': 'निर्माण की धूल', 'Vehicle exhaust': 'वाहनों का धुआँ', 'Forest fire': 'जंगल की आग', 'Not pollution': 'प्रदूषण नहीं', 'Not yet verified': 'अभी जाँचा नहीं गया' });
  let lang = 'en';
  try { lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('dt-lang') || 'en'; } catch {}
  if (lang !== 'hi') lang = 'en';
  const original = new WeakMap(); // node -> English text
  const originalAttr = new WeakMap(); // element -> {attr: English}
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

  const HI_VALUES = new Set(Object.values(HI));
  function hiFor(en) {
    const t = en.replace(/\s+/g, ' ').trim();
    if (!t) return null;
    const lead = en.match(/^\s*/)[0], trail = en.match(/\s*$/)[0];
    if (HI[t]) return lead + HI[t] + trail;
    for (const [re, fn] of PATTERNS) { const m = re.exec(t); if (m) return lead + fn(m) + trail; }
    return null;
  }
  function translateText(node) {
    if (node.parentElement && /^(SCRIPT|STYLE|CODE|PRE|TEXTAREA)$/.test(node.parentElement.tagName)) return;
    if (node.parentElement && node.parentElement.closest('.letter, .answer, #packet, .fnlogs, [data-no-i18n]')) return; // generated content keeps its own language
    const cur = node.nodeValue;
    if (lang === 'hi') {
      if (HI_VALUES.has(cur.trim())) return; // already Hindi
      const hi = hiFor(cur);
      if (hi != null && hi !== cur) { original.set(node, cur); node.nodeValue = hi; }
    } else if (original.has(node)) { node.nodeValue = original.get(node); original.delete(node); }
  }
  function translateAttrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      const store = originalAttr.get(el) || {};
      if (lang === 'hi') {
        const src = store[a] ?? el.getAttribute(a);
        const hi = HI[src.trim()];
        if (hi) { store[a] = src; originalAttr.set(el, store); if (el.getAttribute(a) !== hi) el.setAttribute(a, hi); }
      } else if (store[a] != null) { el.setAttribute(a, store[a]); delete store[a]; }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return translateText(root);
    if (root.nodeType !== 1) return;
    translateAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = tw.nextNode())) { if (n.nodeType === 3) translateText(n); else translateAttrs(n); }
  }
  let busy = false;
  const mo = new MutationObserver((muts) => {
    if (busy || lang !== 'hi') return;
    busy = true;
    try {
      for (const m of muts) {
        if (m.type === 'characterData') translateText(m.target);
        else if (m.type === 'attributes') translateAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    } finally { busy = false; }
  });

  function apply(next) {
    lang = next;
    try { localStorage.setItem('dt-lang', lang); } catch {}
    document.documentElement.lang = lang;
    busy = true; try { walk(document.body); } finally { busy = false; }
    const b = document.getElementById('langBtn');
    if (b) { b.textContent = lang === 'hi' ? 'English' : 'हिंदी'; b.setAttribute('aria-label', lang === 'hi' ? 'Switch to English' : 'हिंदी में देखें'); }
    // The alert and Ask language follow the page language unless the person already picked another one
    const setPicker = (tries = 0) => {
      const sel = document.getElementById('lang');
      if (!sel || sel.dataset.touched) return;
      if ([...sel.options].some((o) => o.value === lang)) { if (sel.value !== lang) { sel.value = lang; sel.dispatchEvent(new Event('change')); } }
      else if (tries < 40) setTimeout(() => setPicker(tries + 1), 250); // options arrive with the first status call
    };
    setPicker();
    window.dispatchEvent(new CustomEvent('dt-lang', { detail: lang }));
  }
  window.dtI18n = { apply, get lang() { return lang; }, HI, hiFor };

  function start() {
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const b = document.getElementById('langBtn');
    if (b) b.addEventListener('click', () => apply(lang === 'hi' ? 'en' : 'hi'));
    const sel = document.getElementById('lang');
    if (sel) sel.addEventListener('change', (e) => { if (e.isTrusted) sel.dataset.touched = '1'; });
    if (lang === 'hi') setTimeout(() => apply('hi'), 0); else apply('en');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
