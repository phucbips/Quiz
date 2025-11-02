# Cập nhật E-Learning System

## Tổng quan
Project Quiz đã được cập nhật từ sử dụng **Supabase** sang **Firebase** làm backend chính.

## Thay đổi chính

### 1. Backend Technology
- **Trước**: Sử dụng Supabase (Database + Auth + Edge Functions)
- **Sau**: Sử dụng Firebase (Firestore + Authentication + Cloud Functions)

### 2. Dependencies cập nhật
```json
// Trước
"@supabase/supabase-js": "^2.39.0"

// Sau  
"firebase": "^10.7.1"
```

### 3. Code chính đã cập nhật
- **File chính**: `src/ELearningSystem.js` - Đã thay thế hoàn toàn
- **Authentication**: Chuyển từ Supabase Auth sang Firebase Auth
- **Database**: Chuyển từ Supabase Database sang Firestore
- **API Integration**: Cập nhật các function call để tương thích với Firebase

### 4. Tính năng mới đã tích hợp
- ✅ Session management cải tiến
- ✅ Conflict detection khi đăng nhập đa thiết bị  
- ✅ Manual Key Generator cho Admin
- ✅ Order Management system
- ✅ Enhanced AI integration (Gemini API)
- ✅ Improved error handling
- ✅ Better user experience

## Cài đặt và Chạy

### 1. Cài đặt Dependencies
```bash
cd code/Quiz-main-updated
npm install
```

### 2. Cấu hình Environment Variables (Tùy chọn)
Tạo file `.env` trong thư mục gốc:
```env
REACT_APP_GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Chạy Development Server
```bash
npm start
```

### 4. Build cho Production
```bash
npm run build
```

## Cấu hình Firebase

### Firebase Config đã có sẵn trong code:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBLeBmdJ85IhfeJ7sGBHOlSjUmYJ6V_YIY",
  authDomain: "thpt-chi-linh.firebaseapp.com",
  projectId: "thpt-chi-linh",
  storageBucket: "thpt-chi-linh.firebasestorage.app",
  messagingSenderId: "59436766218",
  appId: "1:59436766218:web:8621e33cc12f6129e6fbf3",
  measurementId: "G-442TZLSK9J"
};
```

⚠️ **Lưu ý**: Cấu hình Firebase này đã được hardcode trong code. Nếu bạn muốn sử dụng project Firebase khác, hãy cập nhật config này.

## Database Collections cần thiết

Để hệ thống hoạt động đầy đủ, cần tạo các collections sau trong Firestore:

### 1. Users Collection
```javascript
{
  hoTen: "string",
  lop: "string", 
  email: "string",
  unlockedQuizzes: ["array"],
  activeLoginToken: "string",
  createdAt: "timestamp",
  role: "string" // optional: 'teacher', 'admin'
}
```

### 2. Subjects Collection
```javascript
{
  name: "string",
  price: "number",
  quizIds: ["array"]
}
```

### 3. Courses Collection
```javascript
{
  name: "string", 
  price: "number",
  subjectIds: ["array"],
  quizIds: ["array"]
}
```

### 4. Quizzes Collection
```javascript
{
  title: "string",
  embedCode: "string",
  createdBy: "string", // uid của teacher
  createdAt: "timestamp"
}
```

### 5. Orders Collection (cho Admin)
```javascript
{
  userId: "string",
  userName: "string",
  cart: {
    subjects: ["array"],
    courses: ["array"]
  },
  amount: "number",
  paymentMethod: "string",
  status: "string", // 'pending', 'processed'
  generatedKey: "string" // optional
}
```

### 6. Transactions Collection (cho Admin)
```javascript
{
  userId: "string",
  type: "string", // 'key_redeem', 'order_create', etc.
  details: "object",
  timestamp: "timestamp"
}
```

## Firestore Security Rules

### Users Collection
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Admin can read all users
      allow read: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Public collections (read-only for authenticated users)
    match /subjects/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin'];
    }
    
    match /courses/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin'];
    }
    
    match /quizzes/{document} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'teacher']);
    }
    
    match /orders/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    match /transactions/{document} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

## Các API Endpoints cần thiết

Code sử dụng một số API endpoints (Vercel proxy):

### 1. `/api/requestOrder` - Tạo đơn hàng mới
### 2. `/api/redeemKey` - Sử dụng access key
### 3. `/api/grantRole` - Cấp quyền cho user
### 4. `/api/manualGrant` - Cấp key trực tiếp
### 5. `/api/createAccessKey` - Tạo access key mới

⚠️ **Lưu ý**: Các API này cần được triển khai riêng biệt (không có trong Firebase).

## Backup

Project gốc đã được backup trong thư mục: `code/Quiz-main-backup/`

## Troubleshooting

### 1. Lỗi Authentication
- Kiểm tra Firebase config
- Đảm bảo Authentication được enable trong Firebase Console
- Kiểm tra Firestore rules

### 2. Lỗi Database
- Kiểm tra các collections đã được tạo
- Kiểm tra Firestore rules cho permissions
- Kiểm tra data structure

### 3. Lỗi API calls
- Kiểm tra Vercel API endpoints có hoạt động
- Kiểm tra CORS settings
- Kiểm tra environment variables

## Support

Nếu gặp vấn đề trong quá trình cập nhật, vui lòng kiểm tra:
1. Firebase Console setup
2. Firestore collections và rules
3. API endpoints availability
4. Browser console để debug
