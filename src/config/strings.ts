/**
 * Centralized user-facing strings repository.
 * Prepares the codebase for multi-language localization (e.g. Urdu / English) in future milestones.
 */

export const STRINGS = {
  common: {
    appName: "Nyaman Bah",
    tagline: "A Taste of Tawau",
    retry: "Try Again",
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save Changes",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    loading: "Loading...",
    home: "Home",
    back: "Back",
    done: "Done",
    exportCsv: "Export CSV",
    print: "Print Slip",
  },
  auth: {
    signIn: "Sign In",
    signOut: "Sign Out",
    usernameLabel: "Staff Username",
    passwordLabel: "PIN / Password",
    signInSuccess: "Staff member signed in successfully",
    invalidCredentials: "Wrong username or password. Please verify your credentials.",
    forbidden: "You do not have permission to access this floor or management module.",
    sessionLocked: "Session Locked",
    resumeSession: "Tap to Resume",
  },
  floors: {
    halal: "Floor 1 (Arabic)",
    nonHalal: "Floor 2 (Malaysian)",
    tableFree: "Free",
    tableOccupied: "Occupied",
    emptyFloor: "No active tables found on this floor.",
  },
  orders: {
    sendToKitchen: "Send to Kitchen",
    sentSuccess: "Order dispatched to kitchen printers",
    reprintTicket: "Reprint Kitchen Slip",
    alreadySent: "Already Sent Items",
    newItems: "New Draft Items",
    emptyCartTitle: "No items selected yet",
    emptyCartSubtitle: "Tap dishes from the menu catalog on the left to add to order.",
    notePlaceholder: "Add special cooking instructions...",
  },
  billing: {
    pay: "Pay & Close Table",
    settleBill: "Settle Bill",
    paidSuccess: "Bill settled successfully. Cashier slip dispatched.",
    billNo: "Bill Number",
    grandTotal: "Grand Total",
    netSales: "Net Sales",
    grossSales: "Gross Sales",
    discounts: "Discounts",
    cash: "Cash",
    card: "Card",
    online: "Online",
    changeDue: "Change Due",
    amountReceived: "Amount Received",
  },
  network: {
    offline: "You are offline",
    offlineDescription: "Orders cannot be sent until Wi-Fi returns. Drafts are safe.",
    unstable: "Connection unstable",
    restored: "Connection restored",
    serverUnreachable: "Cannot reach POS server. Check Wi-Fi connection.",
  },
  device: {
    preferences: "Tablet Preferences",
    audioFeedback: "Audio Feedback",
    haptics: "Haptic Vibration",
    wakeLock: "Keep Screen Awake",
    largeText: "Large Tablet Text",
    fullscreen: "Fullscreen Mode",
    installPwa: "Install Home Screen App",
  },
} as const;

export type Strings = typeof STRINGS;

