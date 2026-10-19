# Connect Business World — Upgrade Package

## इस पैकेज में
- ब्रांडिंग: **Connect Business World**
- White/green UI और Light/Dark mode toggle (पसंद browser में सेव होती है)
- Supplier Centre: company profile, product catalogue, stock/MOQ/pricing, buyer enquiries, quotation price/message, delivery days, quote validity date और enquiry status
- Supplier केवल अपने business की products और enquiries देख/अपडेट कर सकता है; admin access अलग है
- Manufacturer, Business Owner, Supplier, Seller, Merchant, Buyer, Employee और Admin role definitions
- Admin Categories/Subcategories CRUD
- Social Links management और QR image URL endpoint

## चलाने का तरीका
1. Node.js 18+ वाले hosting पर इस folder को deploy करें।
2. Start command: `npm start`
3. Syntax check: `npm run check`
4. Live website बदलने से पहले current deployment और data का backup लें।

## सुरक्षा
- `SUPER_ADMIN_EMAIL` और `SUPER_ADMIN_PASSWORD` environment variables सेट करें।
- Production में `DEMO_DATA=0` रखें और demo users बंद करें।
- कभी भी password या hosting secrets public chat में साझा न करें।

## महत्वपूर्ण सीमा
यह supplier workflow सहित एक upgraded starter है, पूर्ण production-certified system नहीं। डेटा अभी `data.json` में रखा जाता है; managed PostgreSQL/Supabase database integration अभी नहीं है। कुछ hosting platforms पर local files restart/redeploy के बाद मिट सकती हैं। Production में persistent database, backups, rate-limit persistence, full location hierarchy workflow, supplier document verification, quote acceptance/order/payment flows और security testing जोड़ना आवश्यक है। QR image URL external QR service का उपयोग करता है।
