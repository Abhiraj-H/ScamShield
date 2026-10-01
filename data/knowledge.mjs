export const SOURCES = {
 i4c: {title:'I4C: report financial cyber fraud',url:'https://i4c.mha.gov.in/ncrp.aspx',reviewed:'2026-10-01'},
 chakshu:{title:'DoT: Chakshu suspected fraud communication',url:'https://sancharsaathi.gov.in/sfc/',reviewed:'2026-10-01'},
 rbi:{title:'RBI: customer liability circular (6 July 2017)',url:'https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=11040&Mode=0',reviewed:'2026-10-01'},
 cert:{title:'CERT-In: cyber safety advisories',url:'https://www.cert-in.org.in/',reviewed:'2026-10-01'}
};
export const BRANDS = [
 {name:'SBI',aliases:['sbi','state bank'],domains:['sbi.bank.in','sbi.co.in','onlinesbi.sbi'],contact:'https://retail.sbi.bank.in/',phone:'18001234'},
 {name:'HDFC Bank',aliases:['hdfc'],domains:['hdfc.bank.in','hdfcbank.com'],contact:'https://www.hdfc.bank.in/contact-us',phone:'18001600'},
 {name:'ICICI Bank',aliases:['icici'],domains:['icici.bank.in','icicibank.com'],contact:'https://www.icici.bank.in/customer-care',phone:'18002662'},
 {name:'Axis Bank',aliases:['axis'],domains:['axis.bank.in','axisbank.com'],contact:'https://www.axis.bank.in/'},
 {name:'Punjab National Bank',aliases:['pnb','punjab national'],domains:['pnb.bank.in','pnbindia.in'],contact:'https://pnb.bank.in/'},
 {name:'Bank of Baroda',aliases:['bank of baroda','bob'],domains:['bankofbaroda.bank.in','bankofbaroda.in'],contact:'https://bankofbaroda.bank.in/'},
 {name:'Paytm',aliases:['paytm'],domains:['paytm.com'],contact:'https://paytm.com/'},
 {name:'PhonePe',aliases:['phonepe'],domains:['phonepe.com'],contact:'https://www.phonepe.com/'},
 {name:'Google Pay',aliases:['google pay','gpay'],domains:['pay.google.com','support.google.com'],contact:'https://support.google.com/googlepay/'},
 {name:'Amazon',aliases:['amazon'],domains:['amazon.in','amazon.com'],contact:'https://www.amazon.in/'},
 {name:'India Post',aliases:['india post','indiapost','भारतीय डाक'],domains:['indiapost.gov.in'],contact:'https://www.indiapost.gov.in/'},
 {name:'MSEDCL',aliases:['msedcl','mahavitaran','महावितरण','electricity','बिजली','वीज'],domains:['mahadiscom.in','wss.mahadiscom.in'],contact:'https://www.mahadiscom.in/'},
 {name:'BESCOM',aliases:['bescom'],domains:['bescom.karnataka.gov.in'],contact:'https://bescom.karnataka.gov.in/'},
 {name:'Income Tax Department',aliases:['income tax','incometax','आयकर'],domains:['incometax.gov.in'],contact:'https://www.incometax.gov.in/'},
 {name:'UIDAI',aliases:['uidai','aadhaar','aadhar','आधार'],domains:['uidai.gov.in'],contact:'https://uidai.gov.in/'}
];
// Authored pattern descriptions, not verbatim advisory quotations. Pattern retrieval is keyword based.
export const PATTERNS = [
 ['utility_disconnection','Electricity disconnection','electricity|disconnection|disconnect|mahavitaran|msedcl|बिजली|वीज|कनेक्शन','A threat to disconnect service is used to pressure immediate payment.'],
 ['kyc_phishing','KYC / account phishing','kyc|account.*block|pan.*update|केवाईसी|खाता.*बंद','An account-update pretext asks you to reveal credentials or use an unfamiliar link.'],
 ['digital_arrest','Digital arrest / impersonation','digital arrest|arrest|cbi|police|गिरफ्तार|अटक','A caller claiming to be an official threatens arrest and demands money.'],
 ['parcel_scam','Parcel / delivery fraud','parcel|courier|delivery|india post|indiapost|पार्सल','A delivery pretext asks for a small fee or personal information.'],
 ['investment_fraud','Investment / trading fraud','investment|trading|guaranteed.*return|crypto|निवेश|गुंतवणूक','Promises of guaranteed returns or repeated withdrawal fees warrant caution.'],
 ['job_task_scam','Job / task fraud','part.?time|job|task|telegram|नौकरी|नोकरी','Easy earnings offers can escalate into deposits and withdrawal fees.'],
 ['upi_refund','UPI / refund fraud','refund|qr code|collect request|upi.*pin|रिफंड|परतावा','A request to enter a PIN or scan a QR code to receive money is a warning sign.'],
 ['loan_fraud','Loan / advance fee','loan|processing fee|लोन|कर्ज','An advance processing fee or intrusive app may be part of loan fraud.'],
 ['lottery_fraud','Prize / lottery fraud','lottery|prize|winner|लॉटरी|बक्षीस','An unexpected prize can be used to solicit an advance fee.'],
 ['remote_access','Remote access fraud','anydesk|teamviewer|quick.?support|screen.?share|remote app','Remote access can let a stranger control your device.'],
 ['family_impersonation','Family impersonation','new number|son.*money|daughter.*money|friend.*urgent','A familiar identity on a new number should be checked through a separate channel.'],
 ['other','Other / unclear','.*','There is not enough evidence to identify a specific scam pattern.']
].map(([type,title,keywords,description])=>({type,title,keywords,description,source:SOURCES.i4c}));
export const DEMOS = [
 {title:'Electricity bill',tag:'Urgent payment',text:'Dear Customer, your MSEDCL electricity connection will be disconnected tonight within 2 hours. Pay pending bill at https://mahadiscom-bill.example/payment. Call 9876543210. Install AnyDesk and share your OTP to verify.'},
 {title:'Bank KYC',tag:'Account warning',text:'SBI Alert: Your KYC expires in 2 hours. Account will be blocked. Update now at https://sbi-kyc.example. Send your OTP to 9876543210.'},
 {title:'Parcel delivery',tag:'Unexpected fee',text:'India Post: Your parcel cannot be delivered. Pay Rs. 25 today at https://indiapost-delivery.example. Share your card PIN for verification.'},
 {title:'UPI refund',tag:'Payment request',text:'Your refund is approved. To receive Rs 5000 scan QR code and enter your UPI PIN. Contact supportrefund123@ybl immediately.'}
];
// Synthetic demonstration indicators. .example is reserved; these are not reports about real people.
export const SEED_INDICATORS = ['mahadiscom-bill.example','sbi-kyc.example','indiapost-delivery.example'];
