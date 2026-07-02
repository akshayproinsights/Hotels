import React, { createContext, useContext, useState } from 'react'

type Language = 'en' | 'mr'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, variables?: Record<string, string | number>) => string
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    bookings: 'Bookings',
    rooms: 'Rooms',
    dues: 'Dues',
    app_settings: 'Settings',
    logout: 'Logout',
    pwa: 'PWA',
    offline_alert: 'You are offline. Showing cached information. Actions will sync when online.',
    reports_nav: 'Reports & History',
    total_earnings: 'Total Earnings',
    outstanding_dues: 'Outstanding Dues',
    occupancy_rate: 'Occupancy Rate',
    average_daily_rate: 'Avg Daily Rate (ADR)',
    average_booking_value: 'Avg Booking Value',
    payment_modes: 'Payment Modes Breakdown',
    room_category_revenue: 'Room Category Revenue',
    revenue_trend: 'Revenue Trend (Daily Collections)',
    export_csv: 'Export CSV Ledger',
    reports_title: 'Reports & History',
    reports_subtitle: 'Financial statements, metrics, and room sales analytics.',
    today: 'Today',
    yesterday: 'Yesterday',
    week: 'Week',
    month: 'Month',
    last_7_days: 'Last 7 Days',
    this_month: 'This Month',
    last_month: 'Last Month',
    custom: 'Custom',
    custom_range: 'Custom Range',
    search_ledger: 'Search guest name, room or booking number...',
    no_data_found: 'No records found for the selected date range.',
    total_bookings: 'Total Bookings',
    date_range: 'Date Range',
    from: 'From',
    to: 'To',
    cash: 'Cash',
    upi: 'UPI',
    idfc: 'IDFC',
    pending_status: 'Pending',
    active_stays: 'Active',
    checked_out: 'Checked Out',
    cancelled: 'Cancelled',

    // Login Page
    portal_title: 'Santosh Palace',
    portal_subtitle: 'Hotel Room Management Portal',
    email_address: 'Username',
    password: 'Password',
    sign_in: 'Sign In',
    please_fill_fields: 'Please fill in all fields',
    welcome_back: 'Welcome back, {name}!',
    invalid_credentials: 'Invalid username or password',

    // Calendar & Bookings dashboard
    search_customer: 'Search customer name...',
    all_floors: 'All Floors',
    floor_num: 'Floor {num}',
    quick_book: 'Quick Book Room',
    add_booking: 'Add Booking',
    filter_floor: 'Filter by floor',
    date: 'Date',
    room: 'Room',
    status: 'Status',
    available: 'Available',
    booked: 'Booked',
    maintenance: 'Maintenance',
    dirty: 'Dirty',
    total_paid: 'Total Paid',
    pending: 'Pending',
    no_bookings_found: 'No bookings found',
    loading_dashboard: 'Loading dashboard...',

    // Dues Page
    pending_payments: 'Pending Payments',
    tap_customer_card: 'Tap a customer card to collect or update payment',
    overdue_days: 'Overdue by {days}d',
    checkout_today: 'Checkout Today!',
    checkout_tomorrow: 'Checkout Tomorrow',
    checkout_date: 'Checkout: {date}',
    not_paid: 'Not Paid',
    partly_paid: 'Partly Paid',
    on_hold: 'Reserved',
    total_pending: 'Total Pending',
    total_collected: 'Total Collected',
    no_pending_payments: 'No pending payments',
    fetching_dues: 'Fetching unpaid dues...',

    // Inventory Page
    room_list_inventory: 'Room List & Inventory',
    add_new_room: 'Add New Room',
    search_rooms: 'Search rooms...',
    filter_by_floor: 'Filter by floor...',
    floor: 'Floor',
    base_price: 'Base Price',
    extra_bed_price: 'Extra Bed Price',
    active: 'Active',
    inactive: 'Inactive',
    edit_room: 'Edit Room',
    fetching_inventory: 'Fetching daily inventory status...',
    failed_load_inventory: 'Failed to load inventory',
    try_again: 'Try Again',



    // Settings Page
    rooms_management: 'Rooms Management',
    customers_management: 'Customer Management',
    manage_rooms: 'Manage Rooms',
    manage_customers: 'Manage Customers',
    search_customers: 'Search customers...',
    select_customer_history: 'Select a customer to view their booking history',
    add_room: 'Add Room',
    room_number: 'Room Number',
    extra_bed: 'Extra Bed',
    price: 'Price',
    status_label: 'Status',
    actions: 'Actions',
    active_status: 'Active',
    inactive_status: 'Inactive',
    room_created_success: 'Room created successfully',
    room_updated_success: 'Room updated successfully',
    failed_create_room: 'Failed to create room',
    failed_update_room: 'Failed to update room',

    // Sheets / Modals / Details
    customer_details: 'Customer Details',
    mobile_number: 'Mobile Number',
    id_proof_type: 'ID Proof Type',
    aadhaar_card: 'Aadhaar Card',
    pan_card: 'PAN Card',
    passport: 'Passport',
    driving_license: 'Driving License',
    other_id: 'Other ID',
    id_proof_number: 'ID Proof Number',
    checkin_date: 'Check-in Date',
    checkout_date_label: 'Check-out Date',
    advance_paid: 'Advance Paid',
    extra_beds: 'Extra Beds',
    save_booking: 'Save Booking',
    cancel: 'Cancel',
    total_amount: 'Total Amount',
    paid_amount: 'Paid Amount',
    remaining_dues: 'Remaining Dues',
    payment_status: 'Payment Status',
    update_payment: 'Update Payment',
    mark_fully_paid: 'Mark as Fully Paid',
    add_payment_log: 'Add Payment Log',
    booking_history: 'Customer Booking History',
    select_room_prompt: 'Select Room',
    choose_room_type: 'Choose room type',
    room_details: 'Room Details',
    booking_details: 'Booking Details',
    payment_summary: 'Payment Summary',
    no_bookings_recorded: 'No bookings recorded for this customer.',
    view_id_proof: 'View ID Proof',
    upload_new_id: 'Upload New ID',
    loading: 'Loading...',
    success: 'Success',
    error: 'Error',
    viewing_customer_profile: 'Viewing Customer Profile',
    select_rooms: 'Select Rooms',
    tap_free_room: 'Tap any free room — multiselect supported',
    rooms_selected: '{count} room(s) selected',
    no_rooms: 'No Rooms',
    no_rooms_desc: 'No rooms available for this period',
    adjust_dates: 'Try adjusting the check-in / check-out dates',
    warning: 'Warning',
    partially_available_rooms: 'Partially Available Rooms',
    partial_rooms_desc: 'Free now but next customer arrives soon - use with caution',
    select_room_first: 'Select a Room First',
    confirm_rooms: 'Confirm - {count} Room(s)',
    next_customer: 'Next customer: {date}',
    rooms_suffix: '- {count} rooms',
    night_suffix: '/night',
    partial_label: 'partial',
    vip_ac: 'VIP AC',
    vip_non_ac: 'VIP Non-AC',
    non_ac: 'Non-AC',
    ac: 'AC',
  },
  mr: {
    // Navigation
    bookings: 'बुकिंग',
    rooms: 'खोल्या',
    dues: 'बाकी रक्कम',
    app_settings: 'सेटिंग्ज',
    logout: 'बाहेर पडा',
    pwa: 'PWA',
    offline_alert: 'आपण ऑफलाइन आहात. साठवलेली माहिती दाखवत आहे. ऑनलाईन आल्यावर सिंक होईल.',
    reports_nav: 'अहवाल आणि इतिहास',
    total_earnings: 'एकूण कमाई',
    outstanding_dues: 'एकूण थकबाकी',
    occupancy_rate: 'खोल्यांचा वापर (ऑक्युपन्सी)',
    average_daily_rate: 'सरासरी दैनिक दर (ADR)',
    average_booking_value: 'सरासरी बुकिंग मूल्य',
    payment_modes: 'पेमेंटचे प्रकार',
    room_category_revenue: 'खोलीनुसार कमाई',
    revenue_trend: 'कमाईचा ट्रेंड (दैनिक जमा)',
    export_csv: 'लेजर डाउनलोड (CSV)',
    reports_title: 'अहवाल आणि इतिहास',
    reports_subtitle: 'आर्थिक अहवाल, मुख्य परिमाणे आणि खोली विक्री विश्लेषण.',
    today: 'आज',
    yesterday: 'काल',
    week: 'आठवडा',
    month: 'महिना',
    last_7_days: 'मागील ७ दिवस',
    this_month: 'चालू महिना',
    last_month: 'मागील महिना',
    custom: 'सानुकूल',
    custom_range: 'सानुकूल तारीख श्रेणी',
    search_ledger: 'ग्राहकाचे नाव, खोली किंवा बुकिंग शोधा...',
    no_data_found: 'निवडलेल्या तारखेच्या श्रेणीसाठी कोणतीही नोंद आढळली नाही.',
    total_bookings: 'एकूण बुकिंग संख्या',
    date_range: 'तारीख श्रेणी',
    from: 'पासून',
    to: 'पर्यंत',
    cash: 'रोख (Cash)',
    upi: 'UPI',
    idfc: 'IDFC Bank',
    pending_status: 'प्रलंबित (Pending)',
    active_stays: 'सक्रिय',
    checked_out: 'चेकआउट झाले',
    cancelled: 'रद्द झाले',

    // Login Page
    portal_title: 'संतोष पॅलेस',
    portal_subtitle: 'हॉटेल रूम व्यवस्थापन पोर्टल',
    email_address: 'युझरनेम',
    password: 'पासवर्ड',
    sign_in: 'लॉग इन करा',
    please_fill_fields: 'कृपया सर्व फील्ड भरा',
    welcome_back: 'पुन्हा स्वागत आहे, {name}!',
    invalid_credentials: 'चुकीचे युझरनेम किंवा पासवर्ड',

    // Calendar & Bookings dashboard
    search_customer: 'ग्राहकाचे नाव शोधा...',
    all_floors: 'सर्व मजले',
    floor_num: 'मजला {num}',
    quick_book: 'खोली बुक करा',
    add_booking: 'बुकिंग जोडा',
    filter_floor: 'मजल्यानुसार फिल्टर करा',
    date: 'तारीख',
    room: 'खोली',
    status: 'स्थिती',
    available: 'उपलब्ध',
    booked: 'बुक केलेले',
    maintenance: 'देखभाल',
    dirty: 'अस्वच्छ',
    total_paid: 'एकूण जमा',
    pending: 'बाकी',
    no_bookings_found: 'कोणतीही बुकिंग आढळली नाही',
    loading_dashboard: 'डॅशबोर्ड लोड होत आहे...',

    // Dues Page
    pending_payments: 'प्रलंबित पेमेंट (बाकी)',
    tap_customer_card: 'पेमेंट गोळा करण्यासाठी किंवा अपडेट करण्यासाठी ग्राहकाच्या कार्डवर टॅप करा',
    overdue_days: 'थकीत दिवस: {days}d',
    checkout_today: 'आज चेकआउट आहे!',
    checkout_tomorrow: 'उद्या चेकआउट आहे',
    checkout_date: 'चेकआउट: {date}',
    not_paid: 'पेमेंट केले नाही',
    partly_paid: 'अंशतः पेमेंट झाले',
    on_hold: 'आरक्षित',
    total_pending: 'एकूण बाकी',
    total_collected: 'एकूण गोळा केलेले',
    no_pending_payments: 'कोणतेही प्रलंबित पेमेंट नाही',
    fetching_dues: 'थकीत देयके शोधत आहे...',

    // Inventory Page
    room_list_inventory: 'खोल्यांची यादी आणि उपलब्धता',
    add_new_room: 'नवीन खोली जोडा',
    search_rooms: 'खोल्या शोधा...',
    filter_by_floor: 'मजल्यानुसार फिल्टर...',
    floor: 'मजला',
    base_price: 'मूळ भाडे',
    extra_bed_price: 'अतिरिक्त बेडचे भाडे',
    active: 'सक्रिय',
    inactive: 'निष्क्रिय',
    edit_room: 'खोली संपादन',
    fetching_inventory: 'दैनंदिन खोल्यांची स्थिती लोड करत आहे...',
    failed_load_inventory: 'खोल्यांची स्थिती लोड करण्यात अक्षम',
    try_again: 'पुन्हा प्रयत्न करा',



    // Settings Page
    rooms_management: 'खोली व्यवस्थापन',
    customers_management: 'ग्राहक व्यवस्थापन',
    manage_rooms: 'खोल्यांचे व्यवस्थापन',
    manage_customers: 'ग्राहकांचे व्यवस्थापन',
    search_customers: 'ग्राहक शोधा...',
    select_customer_history: 'ग्राहकाचा बुकिंग रेकॉर्ड पाहण्यासाठी निवडा',
    add_room: 'खोली जोडा',
    room_number: 'खोली क्रमांक',
    extra_bed: 'अतिरिक्त बेड',
    price: 'किंमत',
    status_label: 'स्थिती',
    actions: 'कृती',
    active_status: 'सक्रिय',
    inactive_status: 'निष्क्रिय',
    room_created_success: 'खोली यशस्वीरित्या जोडली गेली',
    room_updated_success: 'खोली यशस्वीरित्या अपडेट केली गेली',
    failed_create_room: 'खोली जोडणे अयशस्वी झाले',
    failed_update_room: 'खोली अपडेट करणे अयशस्वी झाले',

    // Sheets / Modals / Details
    customer_details: 'ग्राहकाचे तपशील',
    mobile_number: 'मोबाईल नंबर',
    id_proof_type: 'ओळखपत्र प्रकार',
    aadhaar_card: 'आधार कार्ड',
    pan_card: 'पॅन कार्ड',
    passport: 'पासपोर्ट',
    driving_license: 'ड्रायव्हिंग लायसन्स',
    other_id: 'इतर ओळखपत्र',
    id_proof_number: 'ओळखपत्र क्रमांक',
    checkin_date: 'चेक-इन तारीख',
    checkout_date_label: 'चेक-आउट तारीख',
    advance_paid: 'अ‍ॅडव्हान्स जमा',
    extra_beds: 'अतिरिक्त बेड संख्या',
    save_booking: 'बुकिंग जतन करा',
    cancel: 'रद्द करा',
    total_amount: 'एकूण बिल रक्कम',
    paid_amount: 'भरलेली रक्कम',
    remaining_dues: 'बाकी रक्कम',
    payment_status: 'पेमेंट स्थिती',
    update_payment: 'पेमेंट अपडेट करा',
    mark_fully_paid: 'पूर्ण पेमेंट म्हणून नोंद करा',
    add_payment_log: 'पेमेंट रेकॉर्ड जोडा',
    booking_history: 'ग्राहकांचे जुने बुकिंग रेकॉर्ड',
    select_room_prompt: 'खोली निवडा',
    choose_room_type: 'खोलीचा प्रकार निवडा',
    room_details: 'खोलीचे तपशील',
    booking_details: 'बुकिंगचे तपशील',
    payment_summary: 'पेमेंट सारांश',
    no_bookings_recorded: 'या ग्राहकाचे कोणतेही रेकॉर्ड सापडले नाही.',
    view_id_proof: 'ओळखपत्र पहा',
    upload_new_id: 'नवीन ओळखपत्र अपलोड करा',
    loading: 'लोड होत आहे...',
    success: 'यशस्वी',
    error: 'त्रुटी',
    viewing_customer_profile: 'ग्राहकाचे प्रोफाइल पहात आहे',
    select_rooms: 'खोल्या निवडा',
    tap_free_room: 'कोणत्याही रिकाम्या खोलीवर टॅप करा - एकापेक्षा जास्त खोल्या निवडू शकता',
    rooms_selected: '{count} खोल्या निवडल्या',
    no_rooms: 'खोल्या उपलब्ध नाहीत',
    no_rooms_desc: 'या कालावधीसाठी खोल्या उपलब्ध नाहीत',
    adjust_dates: 'कृपया चेक-इन / चेक-आउट तारखा बदलून पहा',
    warning: 'सूचना',
    partially_available_rooms: 'अंशतः उपलब्ध खोल्या',
    partial_rooms_desc: 'सध्या रिकामी आहे पण पुढील ग्राहक लवकरच येत आहेत - सावधगिरीने वापरा',
    select_room_first: 'प्रथम खोली निवडा',
    confirm_rooms: 'निश्चित करा - {count} खोल्या',
    next_customer: 'पुढील ग्राहक: {date}',
    rooms_suffix: '- {count} खोल्या',
    night_suffix: '/रात्र',
    partial_label: 'partial',
    vip_ac: 'VIP AC',
    vip_non_ac: 'VIP Non-AC',
    non_ac: 'Non-AC',
    ac: 'AC',
  }
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language')
    return (saved === 'mr' ? 'mr' : 'en') as Language
  })

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('language', lang)
  }

  const t = (key: string, variables?: Record<string, string | number>) => {
    const langTranslations = translations[language] || translations['en']
    let text = langTranslations[key] || translations['en'][key] || key
    if (variables) {
      Object.entries(variables).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v))
      })
    }
    return text
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
