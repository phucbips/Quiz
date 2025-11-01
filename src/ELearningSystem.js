import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { Sparkles, BookOpen, Users, BarChart3, LogOut, ShoppingCart, Plus, Trash2, AlertCircle, CheckCircle2, XCircle, Play, Key, Package, GraduationCap, Edit, Save, X, ChevronDown, Lock, Mail, Loader2, BrainCircuit, Send, Ticket } from 'lucide-react';

// =====================================================
// Supabase SDK Import
// =====================================================
import { createClient } from '@supabase/supabase-js';
// Edge Functions API Base URL
const SUPABASE_FUNCTIONS_URL = 'https://tjhflgjzzphvmddrmjhj.supabase.co/functions/v1';

// Helper function to call Supabase Edge Functions - Global scope
const callSupabaseFunction = async (functionName, data) => {
  const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error(`Function ${functionName} failed: ${response.statusText}`);
  }
  
  const result = await response.json();
  if (result.error) {
    throw new Error(result.error.message);
  }
  
  return result.data;
};

// =====================================================
// Supabase Configuration
// =====================================================
// Supabase URL and Anonymous Key (Environment Variables)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://tjhflgjzzphvmddrmjhj.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqaGZsZ2p6enBodm1kZHJtamhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQwMjEyNzksImV4cCI6MjA0OTU5NzI3OX0.EGdZPu6WFJ6dL9l6P6WmMvC6YX5WwZqE2tWnVnS9oZ8';

// Edge Functions API Base URL
const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || 'https://tjhflgjzzphvmddrmjhj.supabase.co/functions/v1';

// Khởi tạo Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// =====================================================
// Utility Functions
// =====================================================

const generateSessionToken = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const formatCurrency = (amount) => {
  if (typeof amount !== 'number') return "0 đ";
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};



// Hàm gọi Gemini API
const callGeminiAPI = async (prompt) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY; // API key từ environment variables
  if (!apiKey) {
    return "Gemini API key chưa được cấu hình.";
  }
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`API call failed with status ${response.status}`);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (candidate && candidate.content?.parts?.[0]?.text) {
      return candidate.content.parts[0].text;
    } else {
      return "Không thể nhận được gợi ý vào lúc này.";
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Đã xảy ra lỗi khi kết nối với AI.";
  }
};


// =====================================================
// React Context
// =====================================================
const AppContext = createContext(null);
const DataContext = createContext(null);

// =====================================================
// HOOK: useAuth (Quản lý Xác thực & Trạng thái)
// =====================================================
const useAuth = () => {
  const [authState, setAuthState] = useState({
    authUser: null, // User object từ Firebase Auth
    currentUser: null, // User data từ database
    role: 'student', // Vai trò (student, teacher, admin)
    isAuthReady: false, // Auth đã sẵn sàng (đã check xong)
    isLoading: true, // Đang tải data người dùng
    needsOnboarding: false, // Cần điền thông tin
    kicked: false, // Bị đá do đăng nhập nơi khác
    sessionConflict: null, // Phát hiện xung đột phiên
  });

  const [localToken, setLocalToken] = useState(() => localStorage.getItem('sessionToken'));

  const handleSignOut = async () => {
    localStorage.removeItem('sessionToken');
    setLocalToken(null);
    await supabase.auth.signOut();
  };

  // 1. Lắng nghe thay đổi trạng thái Auth (Đăng nhập/Đăng xuất)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user;
      if (user) {
        // Người dùng đã đăng nhập
        // Lấy role từ user metadata (cần thiết lập trong Supabase Auth)
        const role = user.user_metadata?.role || 'student';
        
        // Kiểm tra session conflict
        const { data: userDoc, error: userDocError } = await supabase.from('users').select('*').eq('id', user.uid).single();
        
        if (!userDocError && userDoc) {
          const dbToken = userDoc.activeLoginToken;
          const currentLocalToken = localStorage.getItem('sessionToken');

          if (dbToken && dbToken !== currentLocalToken) {
            // Phát hiện xung đột!
            setAuthState(prev => ({
              ...prev,
              isAuthReady: true,
              isLoading: false,
              sessionConflict: { authUser: user, role: role }
            }));
            return; // Dừng lại, chờ người dùng xác nhận
          }
        }
        
        // Không có xung đột, tiếp tục đăng nhập
        proceedToLogin(user, role);

      } else {
        // Người dùng đã đăng xuất
        setAuthState({
          authUser: null,
          currentUser: null,
          role: 'student',
          isAuthReady: true,
          isLoading: false,
          needsOnboarding: false,
          kicked: false,
          sessionConflict: null,
        });
        localStorage.removeItem('sessionToken');
        setLocalToken(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  // 2. Hàm tiếp tục đăng nhập (sau khi check conflict)
  const proceedToLogin = async (user, role) => {
    const newSessionToken = generateSessionToken();
    localStorage.setItem('sessionToken', newSessionToken);
    setLocalToken(newSessionToken);

    setAuthState(prev => ({
      ...prev,
      authUser: user,
      role: role,
      isAuthReady: true,
      isLoading: true, // Bắt đầu tải data
      sessionConflict: null,
    }));

    // Cập nhật token mới lên DB
    try {
      // ⚡️ FIX: Đổi từ setDoc({merge: true}) sang updateDoc
      // setDoc sẽ tạo document nếu chưa có, xung đột với rule 'create' nghiêm ngặt
      // updateDoc sẽ CHỈ cập nhật nếu doc đã tồn tại, và sẽ bị bỏ qua (catch) nếu là user mới
      // await setDoc(userDocRef, { activeLoginToken: newSessionToken }, { merge: true }); // Dòng cũ
      const { error } = await supabase
        .from('users')
        .update({ activeLoginToken: newSessionToken })
        .eq('id', user.uid);
      
      if (error) throw error;
    } catch (error) {
      // ⚡️ FIX: Lỗi này là BÌNH THƯỜNG nếu là user mới (doc chưa tồn tại)
      // Chỉ log lỗi nếu đó không phải là "not-found"
      if (error.code !== 'not-found') {
        // Lỗi này có thể vẫn là 'Missing or insufficient permissions' nếu rule update của bạn sai
        console.error("Lỗi cập nhật session token (cho user cũ):", error);
      }
      // Nếu là "not-found", chúng ta không làm gì cả,
      // Real-time listener sẽ xử lý và kích hoạt onboarding
    }
  };

  // 3. Lắng nghe thay đổi tài liệu người dùng
  useEffect(() => {
    let unsubscribeUserDoc;

    if (authState.isAuthReady && authState.authUser) {
      
      const userDocChannel = supabase
        .channel('user-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'users',
          filter: `uid=eq.${authState.authUser.uid}`
        }, (payload) => {
          const userData = payload.new;
          
          // Kiểm tra bị đá (session management)
          const dbToken = userData.activeLoginToken;
          if (localToken && dbToken && dbToken !== localToken) {
            handleSignOut(); // Đăng xuất thiết bị này
            setAuthState(prev => ({ ...prev, kicked: true }));
            return;
          }

          setAuthState(prev => ({
            ...prev,
            currentUser: userData,
            isLoading: false,
            needsOnboarding: false, // User đã tồn tại, không cần onboarding
          }));
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('User document listener connected');
          } else if (status === 'CHANNEL_ERROR') {
            console.error("Lỗi lắng nghe user document");
            setAuthState(prev => ({ ...prev, isLoading: false }));
          }
        });

      unsubscribeUserDoc = () => {
        supabase.removeChannel(userDocChannel);
      };
    } else if (authState.isAuthReady && !authState.authUser) {
      // Đã sẵn sàng nhưng chưa đăng nhập
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }

    return () => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, [authState.isAuthReady, authState.authUser, localToken]);
  
  // Hàm cập nhật needsOnboarding (cho OnboardingForm)
  const setOnboardingCompleted = () => {
    setAuthState(prev => ({ ...prev, needsOnboarding: false }));
  };

  return { 
    ...authState, 
    handleSignOut, 
    proceedToLogin,
    setOnboardingCompleted 
  };
};

// =====================================================
// HOOK: usePublicData (Tải dữ liệu chung)
// =====================================================
const usePublicData = () => {
  const { isAuthReady, authUser } = useContext(AppContext);
  const [data, setData] = useState({
    subjects: [],
    courses: [],
    quizzes: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!isAuthReady) return; // Chỉ chạy khi Auth đã sẵn sàng

    // Người dùng phải đăng nhập (kể cả anonymous) mới được đọc
    // Nhưng LoginPage không cần dữ liệu này
    if (!authUser) {
        setData(prev => ({ ...prev, loading: false }));
        return;
    }

    const fetchCollection = (collectionName, setError) => {
      const channel = supabase
        .channel(`${collectionName}-changes`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: collectionName
        }, (payload) => {
          // Fetch all data when changes occur
          supabase.from(collectionName).select('*').then(({ data, error }) => {
            if (error) {
              console.error(`Error fetching ${collectionName}:`, error);
              setError(`Lỗi tải ${collectionName}: ${error.message}`);
              return;
            }
            setData(prev => ({
              ...prev,
              [collectionName]: data || [],
            }));
          });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Initial load
            supabase.from(collectionName).select('*').then(({ data, error }) => {
              if (error) {
                console.error(`Error fetching ${collectionName}:`, error);
                setError(`Lỗi tải ${collectionName}: ${error.message}`);
              } else {
                setData(prev => ({
                  ...prev,
                  [collectionName]: data || [],
                }));
              }
            });
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`Channel error for ${collectionName}`);
            setError(`Lỗi kết nối ${collectionName}`);
          }
        });
      
      return () => {
        supabase.removeChannel(channel);
      };
    };

    const errors = [];
    // Ghi chú: Database RLS policies phải cho phép user đã auth đọc các collection này
    const unsubSubjects = fetchCollection('subjects', (e) => errors.push(e));
    const unsubCourses = fetchCollection('courses', (e) => errors.push(e));
    const unsubQuizzes = fetchCollection('quizzes', (e) => errors.push(e));

    setData(prev => ({
      ...prev,
      loading: false,
      error: errors.length > 0 ? errors.join(', ') : null,
    }));

    return () => {
      unsubSubjects && unsubSubjects();
      unsubCourses && unsubCourses();
      unsubQuizzes && unsubQuizzes();
    };
  }, [isAuthReady, authUser]);

  return data;
};

// =====================================================
// HOOK: useAdminData (Tải dữ liệu cho Admin)
// =====================================================
const useAdminData = (role) => {
  const [adminData, setAdminData] = useState({
    users: [],
    transactions: [],
    orders: [], // ⚡️ MỚI: Thêm state cho orders
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (role !== 'admin') {
      setAdminData(prev => ({ ...prev, loading: false }));
      return; // Không phải admin, không tải
    }

    const errors = [];

    // Tải Users
    const usersChannel = supabase
      .channel('admin-users-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'users'
      }, () => {
        supabase.from('users').select('*').then(({ data, error }) => {
          if (error) {
            console.error("Lỗi tải danh sách người dùng:", error);
            errors.push("Lỗi tải người dùng");
          } else {
            const userList = data.map(doc => ({ uid: doc.uid, ...doc }));
            setAdminData(prev => ({ ...prev, users: userList }));
          }
        });
      })
      .subscribe();
    
    // Initial load
    supabase.from('users').select('*').then(({ data, error }) => {
      if (error) {
        console.error("Lỗi tải danh sách người dùng:", error);
        errors.push("Lỗi tải người dùng");
      } else {
        const userList = data.map(doc => ({ uid: doc.uid, ...doc }));
        setAdminData(prev => ({ ...prev, users: userList }));
      }
    });

    // Tải Transactions
    const transChannel = supabase
      .channel('admin-transactions-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions'
      }, () => {
        supabase.from('transactions').select('*').then(({ data, error }) => {
          if (error) {
            console.error("Lỗi tải giao dịch:", error);
            errors.push("Lỗi tải giao dịch");
          } else {
            const transList = data.map(doc => ({ id: doc.id, ...doc }));
            setAdminData(prev => ({ ...prev, transactions: transList }));
          }
        });
      })
      .subscribe();
    
    // Initial load
    supabase.from('transactions').select('*').then(({ data, error }) => {
      if (error) {
        console.error("Lỗi tải giao dịch:", error);
        errors.push("Lỗi tải giao dịch");
      } else {
        const transList = data.map(doc => ({ id: doc.id, ...doc }));
        setAdminData(prev => ({ ...prev, transactions: transList }));
      }
    });

    // ⚡️ MỚI: Tải Orders (Đơn hàng chờ duyệt)
    const ordersChannel = supabase
      .channel('admin-orders-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders'
      }, () => {
        supabase.from('orders').select('*').then(({ data, error }) => {
          if (error) {
            console.error("Lỗi tải đơn hàng:", error);
            errors.push("Lỗi tải đơn hàng");
          } else {
            const orderList = data.map(doc => ({ id: doc.id, ...doc }));
            setAdminData(prev => ({ ...prev, orders: orderList }));
          }
        });
      })
      .subscribe();
    
    // Initial load
    supabase.from('orders').select('*').then(({ data, error }) => {
      if (error) {
        console.error("Lỗi tải đơn hàng:", error);
        errors.push("Lỗi tải đơn hàng");
      } else {
        const orderList = data.map(doc => ({ id: doc.id, ...doc }));
        setAdminData(prev => ({ ...prev, orders: orderList }));
      }
    });

    setAdminData(prev => ({
      ...prev,
      loading: false,
      error: errors.length > 0 ? errors.join(', ') : null,
    }));

    return () => {
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(transChannel);
      supabase.removeChannel(ordersChannel);
    };
  }, [role]);

  return adminData;
};

// =====================================================
// MODAL: ConfirmLoginModal (Xác nhận Đăng nhập)
// =====================================================
const ConfirmLoginModal = ({ onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center">
          <AlertCircle className="mx-auto text-yellow-500" size={64} />
          <h2 className="text-2xl font-bold mt-6 mb-4">Phát hiện phiên đăng nhập</h2>
          <p className="text-gray-600 mb-8">
            Tài khoản này đã được đăng nhập trên một thiết bị khác. Bạn có muốn tiếp tục và đăng xuất thiết bị kia không?
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="w-full py-3 px-6 bg-gray-200 text-gray-800 font-semibold rounded-xl hover:bg-gray-300 transition"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition"
          >
            Đồng ý
          </button>
        </div>
      </div>
    </div>
  );
};


// =====================================================
// PAGE: LoginPage (Đăng nhập / Đăng ký)
// =====================================================
const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('login'); // 'login', 'register', 'reset'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAuthAction = async (action) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (action === 'google') {
        // Google OAuth đã được xử lý tự động bởi Supabase
        await supabase.auth.signInWithOAuth({ provider: 'google' });
        // onAuthStateChanged sẽ tự động xử lý
      } 
      else if (action === 'register') {
        if (password.length < 6) {
          throw new Error("Mật khẩu phải có ít nhất 6 ký tự");
        }
        await supabase.auth.signUp({ email, password });
      } 
      else if (action === 'login') {
        await supabase.auth.signInWithPassword({ email, password });
      }
      else if (action === 'reset') {
        await supabase.auth.resetPasswordForEmail(email);
        setMessage('Đã gửi email reset mật khẩu! Vui lòng kiểm tra hòm thư.');
      }
    } catch (err) {
      console.error(err);
      switch (err.code) {
        case 'auth/user-not-found':
          setError('Không tìm thấy tài khoản với email này.');
          break;
        case 'auth/wrong-password':
          setError('Sai mật khẩu. Vui lòng thử lại.');
          break;
        case 'auth/email-already-in-use':
          setError('Email này đã được sử dụng.');
          break;
        case 'auth/weak-password':
          setError('Mật khẩu quá yếu.');
          break;
        case 'auth/invalid-email':
          setError('Email không hợp lệ.');
          break;
        case 'auth/popup-closed-by-user':
          setError('Bạn đã đóng cửa sổ đăng nhập Google.');
          break;
        default:
          setError('Đã xảy ra lỗi: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const AuthButton = ({ action, children, className }) => (
    <button
      onClick={() => handleAuthAction(action)}
      disabled={loading}
      className={`w-full py-4 rounded-xl font-bold transition flex items-center justify-center gap-3 disabled:opacity-50 ${className}`}
    >
      {loading && <Loader2 className="animate-spin" size={20} />}
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <GraduationCap size={48} />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
            E-Learning System
          </h1>
          <p className="text-gray-600">Nền tảng học tập trực tuyến</p>
        </div>

        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded mb-6">
            <p className="font-bold">Lỗi</p>
            <p>{error}</p>
          </div>
        )}
        {message && (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 px-4 py-3 rounded mb-6">
            <p className="font-bold">Thành công</p>
            <p>{message}</p>
          </div>
        )}

        <div className="mb-6 flex border-b">
          <button onClick={() => setMode('login')} className={`flex-1 py-3 font-semibold ${mode === 'login' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Đăng nhập</button>
          <button onClick={() => setMode('register')} className={`flex-1 py-3 font-semibold ${mode === 'register' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Đăng ký</button>
        </div>

        {mode === 'reset' ? (
          <div className="space-y-6">
            <p className="text-gray-600 text-center">Nhập email để nhận link reset mật khẩu.</p>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email của bạn"
                className="w-full px-4 py-3 pl-12 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
              />
            </div>
            <AuthButton action="reset" className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg">
              Gửi link Reset
            </AuthButton>
            <button onClick={() => setMode('login')} className="w-full text-blue-600 font-semibold">
              Quay lại Đăng nhập
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full px-4 py-3 pl-12 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                className="w-full px-4 py-3 pl-12 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
              />
            </div>
            
            {mode === 'login' && (
              <>
                <AuthButton action="login" className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:shadow-lg">
                  Đăng nhập
                </AuthButton>
                <button onClick={() => setMode('reset')} className="w-full text-sm text-blue-600 text-right">
                  Quên mật khẩu?
                </button>
              </>
            )}
            
            {mode === 'register' && (
              <AuthButton action="register" className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg">
                Đăng ký
              </AuthButton>
            )}

            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-gray-500">hoặc</span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <AuthButton action="google" className="bg-white border-2 border-gray-300 text-gray-700 hover:bg-gray-50">
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Đăng nhập với Google
            </AuthButton>
          </div>
        )}
      </div>
    </div>
  );
};

// =====================================================
// PAGE: OnboardingForm (Hoàn tất thông tin)
// =====================================================
const OnboardingForm = ({ user, onComplete }) => {
  const [hoTen, setHoTen] = useState('');
  const [lop, setLop] = useState('10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!hoTen.trim()) {
      setError('⚠️ Vui lòng nhập họ và tên!');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Lấy session token hiện tại từ localStorage
      const sessionToken = localStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error("Không tìm thấy session token, vui lòng đăng nhập lại.");
      }

      const userData = {
        hoTen: hoTen.trim(),
        lop,
        email: user.email,
        unlockedQuizzes: [],
        activeLoginToken: sessionToken, // Dùng token đã được tạo khi đăng nhập
        createdAt: new Date().toISOString() // Dùng timestamp hiện tại
      };

      // Tạo document mới (sẽ khớp với 'allow create' rule)
      const { error } = await supabase
        .from('users')
        .insert({
          ...userData,
          id: user.uid // Thêm id để khớp với Supabase structure
        });
      
      if (error) throw error;
      
      onComplete(); // Báo cho AppRouter biết là đã xong

    } catch (err) {
      console.error(err);
      setError('Lỗi khi lưu thông tin: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <Users size={40} />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Chào mừng bạn!</h2>
          <p className="text-gray-600">Vui lòng hoàn tất thông tin cá nhân</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              👤 Họ và tên
            </label>
            <input
              type="text"
              value={hoTen}
              onChange={(e) => setHoTen(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              🎓 Lớp
            </label>
            <select
              value={lop}
              onChange={(e) => setLop(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
            >
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-4 rounded-xl hover:shadow-2xl transition transform hover:scale-105 disabled:opacity-50"
          >
            {loading ? 'Đang lưu...' : 'Xác nhận'}
          </button>
        </form>
      </div>
    </div>
  );
};


// =====================================================
// COMPONENT: ShoppingCartComponent (Giỏ hàng)
// =====================================================
const ShoppingCartComponent = ({ cart, onRemoveItem, onCheckout, loading }) => {
  const { subjects, courses } = useContext(DataContext);
  const [conflicts, setConflicts] = useState([]);

  useEffect(() => {
    if (!subjects.length || !courses.length) return;
    
    const detectCartConflicts = () => {
      const detected = [];
      
      const courseSubjectIds = cart.courses
        .flatMap(courseId => {
          const course = courses.find(c => c.id === courseId);
          return course ? course.subjectIds : [];
        });

      const selectedSubjectIds = cart.subjects;

      selectedSubjectIds.forEach(subjectId => {
        if (courseSubjectIds.includes(subjectId)) {
          const subject = subjects.find(s => s.id === subjectId);
          const conflictCourse = courses.find(c => c.subjectIds.includes(subjectId) && cart.courses.includes(c.id));
          
          if (subject && conflictCourse) {
            detected.push({
              type: 'subject_in_course',
              subjectName: subject.name,
              courseName: conflictCourse.name
            });
          }
        }
      });
      return detected;
    };

    setConflicts(detectCartConflicts());
  }, [cart, subjects, courses]);

  const calculateTotal = () => {
    const subjectsTotal = cart.subjects.reduce((sum, subjectId) => {
      const subject = subjects.find(s => s.id === subjectId);
      return sum + (subject ? subject.price : 0);
    }, 0);

    const coursesTotal = cart.courses.reduce((sum, courseId) => {
      const course = courses.find(c => c.id === courseId);
      return sum + (course ? course.price : 0);
    }, 0);

    return subjectsTotal + coursesTotal;
  };

  const isEmpty = cart.subjects.length === 0 && cart.courses.length === 0;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart size={28} className="text-blue-600" />
        <h2 className="text-2xl font-bold">Giỏ hàng</h2>
        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold">
          {cart.subjects.length + cart.courses.length}
        </span>
      </div>

      {isEmpty ? (
        <div className="text-center py-12 text-gray-400">
          <ShoppingCart size={64} className="mx-auto mb-4 opacity-30" />
          <p>Giỏ hàng trống</p>
        </div>
      ) : (
        <>
          {conflicts.length > 0 && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6 rounded">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-yellow-600 flex-shrink-0 mt-1" size={20} />
                <div>
                  <p className="font-bold text-yellow-800 mb-2">⚠️ Phát hiện trùng lặp!</p>
                  {conflicts.map((conflict, i) => (
                    <p key={i} className="text-sm text-yellow-700">
                      • Môn <strong>{conflict.subjectName}</strong> đã có trong <strong>{conflict.courseName}</strong>
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 mb-6 max-h-64 overflow-y-auto pr-2">
            {cart.subjects.map(subjectId => {
              const subject = subjects.find(s => s.id === subjectId);
              if (!subject) return null;

              return (
                <div key={subjectId} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <BookOpen className="text-blue-600" size={24} />
                    <div>
                      <p className="font-semibold">{subject.name}</p>
                      <p className="text-sm text-gray-600">{formatCurrency(subject.price)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveItem('subject', subjectId)}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              );
            })}

            {cart.courses.map(courseId => {
              const course = courses.find(c => c.id === courseId);
              if (!course) return null;

              return (
                <div key={courseId} className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-3">
                    <Package className="text-purple-600" size={24} />
                    <div>
                      <p className="font-semibold">{course.name}</p>
                      <p className="text-sm text-gray-600">{formatCurrency(course.price)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveItem('course', courseId)}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="border-t-2 border-gray-200 pt-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xl font-bold">Tổng cộng:</span>
              <span className="text-3xl font-bold text-blue-600">{formatCurrency(calculateTotal())}</span>
            </div>

            <button
              onClick={onCheckout}
              disabled={conflicts.length > 0 || loading}
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-bold py-4 rounded-xl hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {/* ⚡️ THAY ĐỔI: Icon và Text */}
              {loading ? <Loader2 className="animate-spin" /> : <Send size={24} />}
              {loading ? 'Đang gửi...' : (conflicts.length > 0 ? 'Vui lòng xóa môn trùng lặp' : 'Gửi yêu cầu duyệt')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// =====================================================
// COMPONENT: GeminiStudyHelper (Trợ lý AI Học tập)
// =====================================================
const GeminiStudyHelper = ({ quizTitle }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [concepts, setConcepts] = useState('');

  const getConcepts = async () => {
    setLoading(true);
    setError('');
    setConcepts('');

    const prompt = `Bạn là một trợ lý gia sư. Một học sinh đang chuẩn bị làm bài tập về chủ đề: "${quizTitle}". 
Hãy liệt kê 3-5 khái niệm hoặc định lý cốt lõi quan trọng nhất mà học sinh cần ôn lại để làm tốt bài tập này. 
Trình bày dưới dạng gạch đầu dòng ngắn gọn.`;

    try {
      const result = await callGeminiAPI(prompt);
      setConcepts(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-2xl border border-blue-200">
      <div className="flex items-center gap-3 mb-4">
        <BrainCircuit className="text-blue-600" size={28} />
        <h3 className="text-xl font-bold text-gray-800">Trợ lý AI: Gợi ý kiến thức</h3>
      </div>
      
      {!concepts && !loading && (
        <button
          onClick={getConcepts}
          className="bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          <Sparkles size={16} className="inline mr-2" />
          Lấy gợi ý
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="animate-spin" />
          <p>AI đang phân tích, vui lòng chờ...</p>
        </div>
      )}

      {error && <p className="text-red-600">{error}</p>}

      {concepts && (
        <div className="prose prose-sm max-w-none text-gray-700">
          <p>Để làm tốt chủ đề này, bạn nên ôn lại:</p>
          <pre className="whitespace-pre-wrap font-sans bg-white/50 p-4 rounded-lg">{concepts}</pre>
        </div>
      )}
    </div>
  );
};


// =====================================================
// PAGE: StudentDashboard (Trang của Học sinh)
// =====================================================
const StudentDashboard = ({ user, onLogout }) => {
  const { authUser } = useContext(AppContext); // ⚡️ MỚI: Lấy authUser để có uid
  const [view, setView] = useState('my-quizzes'); // 'shop', 'my-quizzes', 'redeem-key'
  const [shopTab, setShopTab] = useState('subjects'); // 'subjects', 'courses'
  const [cart, setCart] = useState({ subjects: [], courses: [] });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null); // {id, title, embedCode}
  
  const { subjects, courses, quizzes } = useContext(DataContext);
  
  const unlockedQuizzes = useMemo(() => {
    return (user.unlockedQuizzes || [])
      .map(quizId => quizzes.find(q => q.id === quizId))
      .filter(Boolean); // Lọc bỏ các quiz không tìm thấy
  }, [user.unlockedQuizzes, quizzes]);

  const addToCart = (type, id) => {
    if (type === 'subject') {
      if (!cart.subjects.includes(id)) {
        setCart({ ...cart, subjects: [...cart.subjects, id] });
      }
    } else if (type === 'course') {
      if (!cart.courses.includes(id)) {
        setCart({ ...cart, courses: [...cart.courses, id] });
      }
    }
  };

  const removeFromCart = (type, id) => {
    if (type === 'subject') {
      setCart({ ...cart, subjects: cart.subjects.filter(s => s !== id) });
    } else if (type === 'course') {
      setCart({ ...cart, courses: cart.courses.filter(c => c !== id) });
    }
  };

  // ⚡️ THAY ĐỔI: Đổi tên handleCheckout -> handleRequestOrder
  const handleRequestOrder = async () => {
    setPaymentLoading(true);
    try {
      // ⚡️ THAY ĐỔI: Gọi Supabase Edge Function 'request-order'
      const data = await callSupabaseFunction('request-order', { 
        userId: authUser.uid, 
        items: cart,
        totalAmount: cart.reduce((sum, item) => sum + (item.gia || 0), 0),
        customerInfo: { userName: user.hoTen }
      });
      if (data.success) {
        alert("Đã gửi yêu cầu thành công! Vui lòng chờ Admin duyệt và gửi Key.");
        setCart({ subjects: [], courses: [] }); // Xóa giỏ hàng
      } else {
        throw new Error(data.message || "Không thể gửi yêu cầu.");
      }
    } catch (err) {
      console.error("Lỗi khi gửi yêu cầu:", err);
      alert("Lỗi khi gửi yêu cầu: " + err.message);
    } finally {
      setPaymentLoading(false);
    }
  };
  
  // Xử lý mã nhúng (vô hiệu hóa chuột phải)
  const safeEmbedCode = useMemo(() => {
    if (!selectedQuiz?.embedCode) return '';
    
    let code = selectedQuiz.embedCode;
    // Thêm oncontextmenu="return false;"
    if (code.includes('<iframe')) {
      if (!code.includes('oncontextmenu')) {
        code = code.replace('<iframe', '<iframe oncontextmenu="return false;"');
      }
    }
    return code;
  }, [selectedQuiz]);
  
  // === Views ===
  
  const renderQuizViewer = () => (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <button 
        onClick={() => setSelectedQuiz(null)}
        className="flex items-center gap-2 text-blue-600 font-semibold mb-6"
      >
        <ChevronDown size={20} className="-rotate-90" />
        Quay lại
      </button>
      
      <h2 className="text-3xl font-bold mb-6">{selectedQuiz.title}</h2>
      
      <div className="aspect-video bg-gray-200 rounded-2xl overflow-hidden shadow-lg border">
        <div 
          className="w-full h-full"
          dangerouslySetInnerHTML={{ __html: safeEmbedCode }} 
        />
      </div>
      
      <GeminiStudyHelper quizTitle={selectedQuiz.title} />
    </div>
  );

  const renderShop = () => (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setShopTab('subjects')}
              className={`px-6 py-3 rounded-xl font-semibold transition text-lg flex items-center gap-2 ${
                shopTab === 'subjects'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <BookOpen size={20} /> Môn học
            </button>
            <button
              onClick={() => setShopTab('courses')}
              className={`px-6 py-3 rounded-xl font-semibold transition text-lg flex items-center gap-2 ${
                shopTab === 'courses'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Package size={20} /> Khóa học
            </button>
          </div>

          {shopTab === 'subjects' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {subjects.map(subject => (
                  <div key={subject.id} className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold mb-2">{subject.name}</h3>
                        <p className="text-gray-600 text-sm">{subject.quizIds?.length || 0} bài tập</p>
                      </div>
                      <BookOpen className="text-blue-600" size={32} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-blue-600">{formatCurrency(subject.price)}</span>
                      <button
                        onClick={() => addToCart('subject', subject.id)}
                        disabled={cart.subjects.includes(subject.id)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cart.subjects.includes(subject.id) ? '✓ Đã thêm' : '+ Thêm'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shopTab === 'courses' && (
            <div>
              <div className="space-y-6">
                {courses.map(course => (
                  <div key={course.id} className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl shadow-lg p-6 border-2 border-purple-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Package className="text-purple-600" size={28} />
                          <h3 className="text-2xl font-bold">{course.name}</h3>
                        </div>
                        <p className="text-gray-600 mb-3">{course.quizIds?.length || 0} bài tập</p>
                        <div className="flex flex-wrap gap-2">
                          {course.subjectIds?.map(subId => {
                            const sub = subjects.find(s => s.id === subId);
                            return sub ? (
                              <span key={subId} className="bg-white px-3 py-1 rounded-full text-sm font-semibold text-purple-700 border border-purple-200">
                                {sub.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-purple-200">
                      <div>
                        <span className="text-3xl font-bold text-purple-600">{formatCurrency(course.price)}</span>
                      </div>
                      <button
                        onClick={() => addToCart('course', course.id)}
                        disabled={cart.courses.includes(course.id)}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-xl hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                      >
                        {cart.courses.includes(course.id) ? '✓ Đã thêm' : '+ Thêm vào giỏ'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <ShoppingCartComponent
              cart={cart}
              onRemoveItem={removeFromCart}
              onCheckout={handleRequestOrder} // ⚡️ THAY ĐỔI: Dùng hàm mới
              loading={paymentLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
  
  const renderMyQuizzes = () => (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h2 className="text-3xl font-bold mb-8">Bài tập của tôi</h2>
      
      {unlockedQuizzes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <Key size={64} className="mx-auto text-gray-300 mb-6" />
          <h3 className="text-2xl font-semibold text-gray-700 mb-2">Bạn chưa có bài tập nào</h3>
          <p className="text-gray-500 mb-6">Vui lòng mua môn học hoặc khóa học để truy cập bài tập.</p>
          <button
            onClick={() => setView('shop')}
            className="bg-blue-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-blue-700 transition"
          >
            Đến cửa hàng
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {unlockedQuizzes.map(quiz => (
            <div key={quiz.id} className="bg-white rounded-2xl shadow-lg p-6 flex flex-col justify-between hover:shadow-xl transition">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <CheckCircle2 className="text-green-500" size={32} />
                  <span className="text-xs font-semibold bg-green-100 text-green-700 px-3 py-1 rounded-full">Đã mở khóa</span>
                </div>
                <h3 className="text-xl font-bold mb-4">{quiz.title}</h3>
              </div>
              <button
                onClick={() => setSelectedQuiz(quiz)}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
              >
                <Play size={20} /> Bắt đầu làm
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ⚡️ MỚI: Giao diện nhập Key
  const RedeemKeyComponent = () => {
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleRedeem = async (e) => {
      e.preventDefault();
      if (!key.trim()) {
        setError("Vui lòng nhập Key");
        return;
      }
      setLoading(true);
      setError('');
      setMessage('');
      try {
        const data = await callSupabaseFunction('redeem-access-key', { 
          userId: authUser.uid,
          accessKey: key.trim() 
        });
        
        if (data.isValid) {
          setMessage('Key đã được sử dụng thành công!');
          setKey(''); // Xóa key
          // Dữ liệu user (unlockedQuizzes) sẽ tự động cập nhật qua hook useAuth
        } else {
          throw new Error(data.message);
        }
      } catch (err) {
        console.error("Lỗi kích hoạt key:", err);
        setError(err.message || "Key không hợp lệ hoặc đã hết hạn");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold mb-8">Kích hoạt Key</h2>
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <p className="text-gray-600 mb-6">Nhập Key kích hoạt bạn nhận được từ Admin để mở khóa nội dung hoặc tính năng.</p>
          
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-green-100 border-l-4 border-green-500 text-green-700 px-4 py-3 rounded mb-6">
              {message}
            </div>
          )}
          
          <form onSubmit={handleRedeem} className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Mã Key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none uppercase tracking-widest"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-4 rounded-xl hover:shadow-2xl transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Kích hoạt'}
            </button>
          </form>
        </div>
      </div>
    );
  };

  // === Main Return ===
  if (selectedQuiz) {
    return renderQuizViewer();
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">👨‍🎓 {user.hoTen}</h1>
              <p className="text-green-100 mt-1">Học sinh - Lớp {user.lop}</p>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-6 py-3 rounded-xl transition"
            >
              <LogOut size={20} />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-2 py-4">
            <button
              onClick={() => setView('my-quizzes')}
              className={`px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 ${
                view === 'my-quizzes'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <CheckCircle2 size={20} /> Bài tập của tôi
            </button>
            <button
              onClick={() => setView('shop')}
              className={`px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 ${
                view === 'shop'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <ShoppingCart size={20} /> Cửa hàng
            </button>
            {/* ⚡️ MỚI: Nút Kích hoạt Key */}
            <button
              onClick={() => setView('redeem-key')}
              className={`px-6 py-3 rounded-xl font-semibold transition flex items-center gap-2 ${
                view === 'redeem-key'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Ticket size={20} /> Kích hoạt Key
            </button>
          </div>
        </div>
      </div>

      {view === 'shop' && renderShop()}
      {view === 'my-quizzes' && renderMyQuizzes()}
      {view === 'redeem-key' && <RedeemKeyComponent />} {/* ⚡️ MỚI */}
      
    </div>
  );
};

// =====================================================
// COMPONENT: GeminiQuestionSuggester (Gợi ý câu hỏi AI)
// =====================================================
const GeminiQuestionSuggester = ({ quizTitle, onAddQuestions }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState('');

  const getSuggestions = async () => {
    setLoading(true);
    setError('');
    setSuggestions('');

    const prompt = `Bạn là một trợ lý giáo viên. Hãy tạo 3 câu hỏi trắc nghiệm (A, B, C, D) ôn tập về chủ đề: "${quizTitle}". 
Không cần đáp án. Chỉ cần câu hỏi và các lựa chọn.
Định dạng:
1. [Câu hỏi 1]
    A. [Lựa chọn A]
    B. [Lựa chọn B]
    C. [Lựa chọn C]
    D. [Lựa chọn D]
2. [Câu hỏi 2]
    ...
`;

    try {
      const result = await callGeminiAPI(prompt);
      setSuggestions(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-2xl border border-blue-200">
      <div className="flex items-center gap-3 mb-4">
        <BrainCircuit className="text-blue-600" size={28} />
        <h3 className="text-xl font-bold text-gray-800">AI: Gợi ý câu hỏi</h3>
      </div>
      
      <button
        onClick={getSuggestions}
        disabled={loading}
        className="bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
      >
        <Sparkles size={16} className="inline mr-2" />
        {loading ? 'Đang tạo...' : 'Tạo 3 câu hỏi gợi ý'}
      </button>

      {loading && (
        <div className="flex items-center gap-3 text-gray-600 mt-4">
          <Loader2 className="animate-spin" />
          <p>AI đang soạn câu hỏi, vui lòng chờ...</p>
        </div>
      )}

      {error && <p className="text-red-600 mt-4">{error}</p>}

      {suggestions && (
        <div className="mt-4">
          <pre className="whitespace-pre-wrap font-sans bg-white/50 p-4 rounded-lg text-sm text-gray-700">
            {suggestions}
          </pre>
          <p className="text-xs text-gray-500 mt-2">Lưu ý: Đây chỉ là gợi ý, bạn có thể chỉnh sửa lại trong mã nhúng.</p>
        </div>
      )}
    </div>
  );
};

// =====================================================
// PAGE: TeacherDashboard (Trang của Giáo viên)
// =====================================================
const TeacherDashboard = ({ user, onLogout }) => {
  const { authUser } = useContext(AppContext);
  // ⚡️ FIX 1: Lấy thêm subjects và courses từ context
  const { quizzes, loading: loadingQuizzes, subjects, courses } = useContext(DataContext);
  // const [view, setView] = useState('quizzes'); // 'quizzes', 'profile' - Not used
  const [editingQuiz, setEditingQuiz] = useState(null); // null, 'new', hoặc { id, ... }
  const [formData, setFormData] = useState({ title: '', embedCode: '' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  
  const myQuizzes = useMemo(() => {
    return quizzes.filter(q => q.createdBy === authUser.uid);
  }, [quizzes, authUser]);

  const handleEdit = (quiz) => {
    setEditingQuiz(quiz);
    setFormData({ title: quiz.title, embedCode: quiz.embedCode });
    setFormError('');
  };
  
  const handleNew = () => {
    setEditingQuiz('new');
    setFormData({ title: '', embedCode: '' });
    setFormError('');
  };

  const handleCancel = () => {
    setEditingQuiz(null);
    setFormError('');
  };
  
  const handleDelete = async (quizId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa bài tập này? Hành động này không thể hoàn tác.")) {
      return;
    }
    
    setFormLoading(true);
    try {
      // 1. Xóa khỏi collection 'quizzes'
      const { error } = await supabase
        .from('quizzes')
        .delete()
        .eq('id', quizId);
      
      if (error) throw error;
      
      // 2. Xóa quizId khỏi tất cả 'subjects' và 'courses'
      // ⚡️ FIX 2: Xóa dòng gọi hook useContext tại đây
      // const { subjects, courses } = useContext(DataContext); // Dòng cũ (gây lỗi)

      // ⚡️ FIX 3: Dùng subjects và courses đã lấy từ context ở top-level
      // Thay thế batch operations bằng Supabase individual updates
      const updatePromises = [];
      
      subjects.forEach(subject => {
        if (subject.quizIds?.includes(quizId)) {
          const newQuizIds = subject.quizIds.filter(id => id !== quizId);
          updatePromises.push(
            supabase
              .from('subjects')
              .update({ quizIds: newQuizIds })
              .eq('id', subject.id)
          );
        }
      });
      
      courses.forEach(course => {
        if (course.quizIds?.includes(quizId)) {
          const newQuizIds = course.quizIds.filter(id => id !== quizId);
          updatePromises.push(
            supabase
              .from('courses')
              .update({ quizIds: newQuizIds })
              .eq('id', course.id)
          );
        }
      });
      
      // 3. (Tùy chọn) Xóa quizId khỏi 'unlockedQuizzes' của users
      // Bỏ qua bước này để đơn giản, vì quizId không còn tồn tại sẽ tự động bị lọc
      
      // Thực hiện tất cả updates
      await Promise.allSettled(updatePromises);
      handleCancel();
      
    } catch (err) {
      console.error("Lỗi khi xóa bài tập:", err);
      setFormError("Lỗi khi xóa bài tập: " + err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.embedCode) {
      setFormError("Vui lòng điền đầy đủ Tiêu đề và Mã nhúng.");
      return;
    }
    
    setFormLoading(true);
    setFormError('');
    
    try {
      if (editingQuiz === 'new') {
        // Tạo mới
        const { error } = await supabase
          .from('quizzes')
          .insert({
            ...formData,
            createdBy: authUser.uid,
            createdAt: new Date().toISOString()
          });
        
        if (error) throw error;
      } else {
        // Cập nhật
        const { error } = await supabase
          .from('quizzes')
          .update({
            ...formData
          })
          .eq('id', editingQuiz.id);
        
        if (error) throw error;
      }
      handleCancel();
      
    } catch (err) {
      console.error("Lỗi khi lưu bài tập:", err);
      setFormError("Lỗi khi lưu bài tập: " + err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const renderQuizEditor = () => (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold mb-8">
        {editingQuiz === 'new' ? 'Tạo bài tập mới' : 'Chỉnh sửa bài tập'}
      </h2>
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg space-y-6">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Tiêu đề bài tập</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            placeholder="Ví dụ: Bài tập Hàm số bậc nhất"
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Mã nhúng (Quizizz, Azota...)</label>
          <textarea
            value={formData.embedCode}
            onChange={(e) => setFormData({...formData, embedCode: e.target.value})}
            placeholder='<iframe src="..."></iframe>'
            rows={8}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none font-mono text-sm"
          />
        </div>
        
        {formError && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded">
            {formError}
          </div>
        )}
        
        <div className="flex justify-between items-center gap-4">
          <div>
            {editingQuiz !== 'new' && (
              <button
                type="button"
                onClick={() => handleDelete(editingQuiz.id)}
                disabled={formLoading}
                className="text-red-600 font-semibold px-6 py-3 rounded-xl hover:bg-red-50 transition disabled:opacity-50"
              >
                <Trash2 size={16} className="inline mr-2" /> Xóa
              </button>
            )}
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={formLoading}
              className="bg-gray-200 text-gray-800 font-semibold px-6 py-3 rounded-xl hover:bg-gray-300 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
            >
              {formLoading ? <Loader2 className="animate-spin" /> : <Save size={16} className="inline mr-2" />}
              {editingQuiz === 'new' ? 'Tạo mới' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </form>

      <GeminiQuestionSuggester quizTitle={formData.title} />
    </div>
  );
  
  const renderQuizList = () => (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold">Bài tập của tôi</h2>
        <button
          onClick={handleNew}
          className="bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Plus size={20} /> Tạo bài tập mới
        </button>
      </div>
      
      {loadingQuizzes ? (
        <div className="text-center py-12">
          <Loader2 className="animate-spin mx-auto text-gray-400" size={48} />
        </div>
      ) : myQuizzes.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-lg">
          <p className="text-gray-500">Bạn chưa tạo bài tập nào.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full min-w-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Tiêu đề</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Mã nhúng</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {myQuizzes.map(quiz => (
                <tr key={quiz.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="font-semibold text-gray-800">{quiz.title}</p>
                  </td>
                  <td className="px-6 py-4">
                    <code className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {quiz.embedCode.substring(0, 50)}...
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => handleEdit(quiz)}
                      className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition"
                    >
                      <Edit size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">👩‍🏫 {user.hoTen}</h1>
              <p className="text-teal-100 mt-1">Giáo viên - Lớp {user.lop}</p>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-6 py-3 rounded-xl transition"
            >
              <LogOut size={20} />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
      
      {/* ⚡️ THAY ĐỔI: Kiểm tra quyền 'canCreateQuizzes' */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {user.canCreateQuizzes ? (
          editingQuiz ? renderQuizEditor() : renderQuizList()
        ) : (
          <div className="text-center p-12 bg-white rounded-lg shadow-lg">
            <Lock size={48} className="mx-auto text-gray-400 mb-6" />
            <h3 className="text-2xl font-bold mt-4">Bạn chưa được cấp quyền tạo bài tập</h3>
            <p className="text-gray-600 mt-2">Vui lòng liên hệ Admin để nhận Key kích hoạt tính năng này.</p>
            {/* Tương lai: Có thể thêm ô nhập key cho giáo viên tại đây */}
          </div>
        )}
      </div>
    </div>
  );
};


// =====================================================
// PAGE: AdminDashboard (Trang của Admin)
// =====================================================

// Component Quản lý Người dùng
const UserManager = ({ users, authUser }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const grantRole = async (uid, role) => {
    setLoading(true);
    setError('');
    try {
      const data = await callSupabaseFunction('grant-role', { 
        userId: uid, 
        role: role,
        grantedBy: authUser.uid,
        reason: 'Manual grant from admin panel'
      });
      alert(`Thành công: ${data.message}`);
    } catch (err) {
      console.error(err);
      setError(err.message);
      alert(`Thất bại: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {error && <div className="p-4 bg-red-100 text-red-700">{error}</div>}
      <table className="w-full min-w-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Họ tên</th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Email</th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Vai trò</th>
            <th className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Hành động</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {users.map(user => (
            <tr key={user.uid}>
              <td className="px-6 py-4 whitespace-nowrap">
                <p className="font-semibold text-gray-800">{user.hoTen}</p>
                <p className="text-sm text-gray-500">Lớp {user.lop}</p>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <p className="text-gray-700">{user.email}</p>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {user.role ? (
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    user.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'
                  }`}>
                    {user.role}
                  </span>
                ) : (
                  <span className="text-gray-400 text-sm">student</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                <button
                  onClick={() => grantRole(user.uid, 'teacher')}
                  disabled={loading || user.role === 'teacher'}
                  className="bg-teal-100 text-teal-700 px-3 py-2 rounded-lg hover:bg-teal-200 transition text-sm disabled:opacity-50"
                >
                  Cấp quyền Teacher
                </button>
                <button
                  onClick={() => grantRole(user.uid, 'admin')}
                  disabled={loading || user.role === 'admin'}
                  className="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition text-sm disabled:opacity-50"
                >
                  Cấp quyền Admin
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Component Quản lý Nội dung (Chung cho Subjects, Courses, Quizzes)
const ContentManager = ({ type, items, onSave, onDelete }) => {
  const [editingItem, setEditingItem] = useState(null); // null, 'new', hoặc { id, ... }
  const [formData, setFormData] = useState({});
  const [formLoading, setFormLoading] = useState(false);
  
  const getEmptyForm = () => {
    switch (type) {
      case 'subjects': return { name: '', price: 0, quizIds: [] };
      case 'courses': return { name: '', price: 0, subjectIds: [], quizIds: [] };
      case 'quizzes': return { title: '', embedCode: '', createdBy: '' };
      default: return {};
    }
  };
  
  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData(item);
  };
  
  const handleNew = () => {
    setEditingItem('new');
    setFormData(getEmptyForm());
  };
  
  const handleCancel = () => {
    setEditingItem(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'price') {
      setFormData(f => ({ ...f, [name]: Number(value) }));
    } else if (name === 'quizIds' || name === 'subjectIds') {
      setFormData(f => ({ ...f, [name]: value.split(',').map(s => s.trim()).filter(Boolean) }));
    } else {
      setFormData(f => ({ ...f, [name]: value }));
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    await onSave(formData, editingItem === 'new' ? null : editingItem.id);
    setFormLoading(false);
    setEditingItem(null);
  };

  const renderForm = () => (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-8">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-bold mb-6">
          {editingItem === 'new' ? 'Tạo mới' : 'Chỉnh sửa'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {Object.keys(formData).map(key => {
            if (key === 'id' || key === 'createdBy' || key.includes('At')) return null;
            
            const label = key.charAt(0).toUpperCase() + key.slice(1);
            const value = formData[key];
            
            if (key === 'embedCode') {
              return (
                <div key={key}>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{label}</label>
                  <textarea
                    name={key}
                    value={value}
                    onChange={handleChange}
                    rows={5}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none font-mono text-sm"
                  />
                </div>
              );
            }
            
            if (Array.isArray(value)) {
              return (
                <div key={key}>
                  <label className="block text-sm font-bold text-gray-700 mb-2">{label} (cách nhau bằng dấu phẩy)</label>
                  <input
                    type="text"
                    name={key}
                    value={value.join(', ')}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                  />
                </div>
              );
            }
            
            return (
              <div key={key}>
                <label className="block text-sm font-bold text-gray-700 mb-2">{label}</label>
                <input
                  type={typeof value === 'number' ? 'number' : 'text'}
                  name={key}
                  value={value}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                />
              </div>
            );
          })}
          
          <div className="flex justify-end gap-4 pt-6">
            <button
              type="button"
              onClick={handleCancel}
              disabled={formLoading}
              className="bg-gray-200 text-gray-800 font-semibold px-6 py-3 rounded-xl hover:bg-gray-300 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
            >
              {formLoading ? <Loader2 className="animate-spin" /> : 'Lưu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {editingItem && renderForm()}
      <div className="p-6 flex justify-between items-center">
        <h3 className="text-xl font-bold">Quản lý {type}</h3>
        <button
          onClick={handleNew}
          className="bg-blue-600 text-white font-bold px-5 py-2 rounded-xl hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Plus size={20} /> Tạo mới
        </button>
      </div>
      <table className="w-full min-w-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Tên / Tiêu đề</th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Thông tin</th>
            <th className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Hành động</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {items.map(item => (
            <tr key={item.id}>
              <td className="px-6 py-4 whitespace-nowrap">
                <p className="font-semibold text-gray-800">{item.name || item.title}</p>
                <p className="text-sm text-gray-500">{item.id}</p>
              </td>
              <td className="px-6 py-4">
                {item.price !== undefined && <p>Giá: {formatCurrency(item.price)}</p>}
                {item.quizIds && <p>Số quiz: {item.quizIds.length}</p>}
                {item.subjectIds && <p>Số môn: {item.subjectIds.length}</p>}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                <button
                  onClick={() => handleEdit(item)}
                  className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition text-sm"
                >
                  Sửa
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition text-sm"
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Component Cấp Key Thủ công
const ManualKeyGrant = ({ users, subjects, courses, authUser }) => {
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedItem, setSelectedItem] = useState(''); // 'subject_xxx' or 'course_xxx'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !selectedItem) {
      setError("Vui lòng chọn người dùng và vật phẩm.");
      return;
    }
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const [type, itemId] = selectedItem.split('_');
      
      const data = await callSupabaseFunction('manual-grant', {
        userId: selectedUser,
        contentId: `${type}_${itemId}`,
        grantedBy: authUser.uid,
        reason: `Manual grant for ${type}`
      });
      
      setMessage(data.message);
      
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <h3 className="text-xl font-bold mb-6">Cấp Key Trực tiếp (Manual Grant)</h3>
      {error && <div className="p-4 mb-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
      {message && <div className="p-4 mb-4 bg-green-100 text-green-700 rounded-lg">{message}</div>}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Chọn Người dùng</label>
          <select 
            value={selectedUser} 
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          >
            <option value="">-- Chọn --</option>
            {users.map(u => (
              <option key={u.uid} value={u.uid}>{u.hoTen} ({u.email})</option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Chọn Vật phẩm (Môn học / Khóa học)</label>
          <select 
            value={selectedItem} 
            onChange={(e) => setSelectedItem(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          >
            <option value="">-- Chọn --</option>
            <optgroup label="Môn học">
              {subjects.map(s => (
                <option key={s.id} value={`subject_${s.id}`}>{s.name} ({formatCurrency(s.price)})</option>
              ))}
            </optgroup>
            <optgroup label="Khóa học">
              {courses.map(c => (
                <option key={c.id} value={`course_${c.id}`}>{c.name} ({formatCurrency(c.price)})</option>
              ))}
            </optgroup>
          </select>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-bold py-4 rounded-xl hover:shadow-xl transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Cấp quyền truy cập'}
        </button>
      </form>
    </div>
  );
};

// ⚡️ MỚI: Component Tạo Key Thủ công (Linh hoạt)
const ManualKeyGenerator = ({ subjects, courses, authUser }) => {
  const [cart, setCart] = useState({ subjects: [], courses: [] });
  const [capability, setCapability] = useState(''); // 'TEACHER_QUIZ_CREATION'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(''); // Để hiển thị Key đã tạo

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const isEmpty = cart.subjects.length === 0 && cart.courses.length === 0;
    if (isEmpty && !capability) {
      setError("Vui lòng chọn ít nhất một vật phẩm hoặc một tính năng để tạo Key.");
      return;
    }
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const payload = {
        userId: authUser.uid,
        contentId: isEmpty ? capability : cart.map(item => item.id).join(','),
        duration: 30, // 30 ngày
        paymentAmount: cart.reduce((sum, item) => sum + (item.gia || 0), 0)
      };
      
      const data = await callSupabaseFunction('create-access-key', payload);
      
      if (data.isValid || data.status) {
        setMessage(`Tạo Key thành công: ${data.accessKey}\n\n(Hãy copy và gửi cho người dùng)`);
        setCart({ subjects: [], courses: [] }); // Reset
        setCapability('');
      } else {
        throw new Error(data.message);
      }
      
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Logic mini-cart để chọn khóa học
  const addToCart = (type, id) => {
    if (type === 'subject') {
      if (!cart.subjects.includes(id)) setCart(c => ({ ...c, subjects: [...c.subjects, id] }));
    } else {
      if (!cart.courses.includes(id)) setCart(c => ({ ...c, courses: [...c.courses, id] }));
    }
  };
  const removeFromCart = (type, id) => {
    if (type === 'subject') {
      setCart(c => ({ ...c, subjects: c.subjects.filter(s => s !== id) }));
    } else {
      setCart(c => ({ ...c, courses: c.courses.filter(s => s !== id) }));
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <h3 className="text-xl font-bold mb-6">Tạo Key Thủ công (Flexible Key)</h3>
      {error && <div className="p-4 mb-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
      {message && (
        <div className="p-4 mb-4 bg-green-100 text-green-700 rounded-lg">
          <pre className="whitespace-pre-wrap font-sans">{message}</pre>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Phần 1: Chọn Tính năng */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">Chọn Tính năng (Ưu tiên cao hơn)</label>
          <select 
            value={capability} 
            onChange={(e) => setCapability(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
          >
            <option value="">-- Không chọn (Tạo key nội dung) --</option>
            <option value="TEACHER_QUIZ_CREATION">Cấp quyền Giáo viên (Tạo Quiz)</option>
            {/* Thêm các quyền khác sau này */}
          </select>
          <p className="text-xs text-gray-500 mt-1">Nếu chọn tính năng, Key sẽ bỏ qua các vật phẩm bên dưới.</p>
        </div>

        <div className="relative flex py-2 items-center">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="flex-shrink mx-4 text-gray-500">hoặc</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

        {/* Phần 2: Chọn Vật phẩm (nếu không chọn tính năng) */}
        <div className={capability ? 'opacity-50 pointer-events-none' : ''}>
          <label className="block text-sm font-bold text-gray-700 mb-2">Chọn Vật phẩm (Môn học / Khóa học)</label>
          <div className="grid grid-cols-2 gap-4">
            <select 
              onChange={(e) => addToCart('subject', e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
              disabled={!!capability}
            >
              <option value="">-- Thêm Môn học --</option>
              {subjects.map(s => (
                <option key={s.id} value={s.id} disabled={cart.subjects.includes(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
            <select 
              onChange={(e) => addToCart('course', e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
              disabled={!!capability}
            >
              <option value="">-- Thêm Khóa học --</option>
              {courses.map(c => (
                <option key={c.id} value={c.id} disabled={cart.courses.includes(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Hiển thị mini-cart */}
          <div className="mt-4 space-y-2">
            {cart.subjects.map(id => {
              const item = subjects.find(s => s.id === id);
              return (
                <div key={id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                  <span className="text-sm font-semibold">{item?.name} (Môn)</span>
                  <button type="button" onClick={() => removeFromCart('subject', id)}><X size={16} className="text-red-500" /></button>
                </div>
              );
            })}
            {cart.courses.map(id => {
              const item = courses.find(c => c.id === id);
              return (
                <div key={id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                  <span className="text-sm font-semibold">{item?.name} (Khóa)</span>
                  <button type="button" onClick={() => removeFromCart('course', id)}><X size={16} className="text-red-500" /></button>
                </div>
              );
            })}
          </div>
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-4 rounded-xl hover:shadow-xl transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Tạo Key'}
        </button>
      </form>
    </div>
  );
};

// ⚡️ MỚI: Component Quản lý Đơn hàng
const OrderManager = ({ orders, users, authUser }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Hàm này chỉ tạo Key, không tự động cấp
  const handleGenerateKey = async (order) => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        userId: authUser.uid,
        contentId: order.cart.map(item => item.id).join(','),
        duration: 30,
        paymentAmount: order.cart.reduce((sum, item) => sum + (item.gia || 0), 0)
      };
      
      const data = await callSupabaseFunction('create-access-key', payload);
      
      if (data.isValid || data.status) {
        const key = data.accessKey;
        alert(`Tạo Key thành công: ${key}\n\nHãy gửi Key này cho ${order.userName}.`);
        // Tự động cập nhật trạng thái đơn hàng (ví dụ: 'processed')
        const { error } = await supabase
          .from('orders')
          .update({
            status: 'processed',
            generatedKey: key
          })
          .eq('id', order.id);
        
        if (error) throw error;
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
      alert("Lỗi khi tạo key: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {error && <div className="p-4 bg-red-100 text-red-700">{error}</div>}
      <table className="w-full min-w-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Người dùng</th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Nội dung</th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Trạng thái</th>
            <th className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Hành động</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {orders.map(order => (
            <tr key={order.id}>
              <td className="px-6 py-4 whitespace-nowrap">
                <p className="font-semibold text-gray-800">{order.userName}</p>
                <p className="text-sm text-gray-500">{order.userId}</p>
              </td>
              <td className="px-6 py-4">
                <p className="text-sm">Môn: {order.cart.subjects.join(', ') || 'Không có'}</p>
                <p className="text-sm">Khóa: {order.cart.courses.join(', ') || 'Không có'}</p>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {order.status === 'processed' ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                    Đã xử lý
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
                    Đang chờ
                  </span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                {order.status !== 'processed' && (
                  <button
                    onClick={() => handleGenerateKey(order)}
                    disabled={loading}
                    className="bg-blue-100 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-200 transition text-sm disabled:opacity-50"
                  >
                    Tạo Key
                  </button>
                )}
                {order.generatedKey && (
                   <span className="text-xs text-gray-500 font-mono">{order.generatedKey}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Main Admin Dashboard
const AdminDashboard = ({ user, onLogout }) => {
  const { authUser, role } = useContext(AppContext);
  const { subjects, courses, quizzes } = useContext(DataContext);
  // ⚡️ THAY ĐỔI: Lấy thêm 'orders' từ hook
  const { users, transactions, orders } = useAdminData(role);
  
  const [view, setView] = useState('users');
  
  // ⚡️ THAY ĐỔI: Cập nhật Tabs
  const adminTabs = [
    { key: 'users', label: 'Người dùng', icon: Users },
    { key: 'orders', label: 'Đơn hàng', icon: Package }, // Mới
    { key: 'create-key', label: 'Tạo Key', icon: Sparkles }, // Mới
    { key: 'grant', label: 'Cấp Key Trực tiếp', icon: Key }, // Sửa tên
    { key: 'subjects', label: 'Môn học', icon: BookOpen },
    { key: 'courses', label: 'Khóa học', icon: Package },
    { key: 'quizzes', label: 'Bài tập', icon: CheckCircle2 },
    { key: 'transactions', label: 'Giao dịch (Log)', icon: BarChart3 }, // Sửa tên
  ];

  const handleSave = async (data, id) => {
    const collectionName = view; // 'subjects', 'courses', 'quizzes'
    try {
      if (id) {
        // Update
        const { error } = await supabase
          .from(collectionName)
          .update(data)
          .eq('id', id);
        
        if (error) throw error;
      } else {
        // Create
        if (collectionName === 'quizzes') {
          data.createdBy = user.uid; // Gán admin là người tạo
        }
        const { error } = await supabase
          .from(collectionName)
          .insert(data);
        
        if (error) throw error;
      }
    } catch (err) {
      console.error(`Lỗi khi lưu ${collectionName}:`, err);
      alert(`Lỗi: ${err.message}`);
    }
  };
  
  const handleDelete = async (id) => {
    const collectionName = view;
    if (!window.confirm(`Bạn có chắc muốn xóa ${collectionName} với ID: ${id}?`)) return;
    try {
      const { error } = await supabase
        .from(collectionName)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      // TODO: Xóa tham chiếu (ví dụ: xóa quizId khỏi subjects)
      // Tạm thời bỏ qua để đơn giản (nhưng TeacherDashboard CÓ logic này)
      // Cần đồng bộ hóa logic này, lý tưởng nhất là dùng Cloud Function
    } catch (err) {
      console.error(`Lỗi khi xóa ${collectionName}:`, err);
      alert(`Lỗi: ${err.message}`);
    }
  };
  
  const renderView = () => {
    switch(view) {
      case 'users':
        return <UserManager users={users} authUser={authUser} />;
      // ⚡️ MỚI: Thêm view cho 'orders' và 'create-key'
      case 'orders':
        return <OrderManager orders={orders} users={users} authUser={authUser} />;
      case 'create-key':
        return <ManualKeyGenerator subjects={subjects} courses={courses} authUser={authUser} />;
      case 'subjects':
        return <ContentManager type="subjects" items={subjects} onSave={handleSave} onDelete={handleDelete} />;
      case 'courses':
        return <ContentManager type="courses" items={courses} onSave={handleSave} onDelete={handleDelete} />;
      case 'quizzes':
        return <ContentManager type="quizzes" items={quizzes} onSave={handleSave} onDelete={handleDelete} />;
      case 'grant':
        return <ManualKeyGrant users={users} subjects={subjects} courses={courses} authUser={authUser} />;
      case 'transactions':
        return (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-xl font-bold mb-6">Lịch sử Giao dịch</h3>
            {/* Đơn giản hóa, chỉ hiển thị JSON */}
            <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
              {JSON.stringify(transactions, null, 2)}
            </pre>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-gradient-to-r from-red-600 to-purple-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">🛡️ {user.hoTen}</h1>
              <p className="text-red-100 mt-1">Quản trị viên (Admin)</p>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-6 py-3 rounded-xl transition"
            >
              <LogOut size={20} />
              Đăng xuất
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 py-4 overflow-x-auto">
            {adminTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`px-5 py-3 rounded-xl font-semibold transition flex items-center gap-2 ${
                  view === tab.key
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <tab.icon size={20} /> {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-6 py-12">
        {renderView()}
      </div>
    </div>
  );
};


// =====================================================
// COMPONENT: GlobalLoader (Trình tải Toàn cục)
// =====================================================
const GlobalLoader = ({ message = "Đang tải ứng dụng..." }) => (
  <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-500 flex items-center justify-center p-4 text-white">
    <div className="text-center">
      <Loader2 className="animate-spin mx-auto mb-6" size={64} />
      <h1 className="text-2xl font-bold">{message}</h1>
    </div>
  </div>
);

// =====================================================
// COMPONENT: KickedModal (Modal Bị đá)
// =====================================================
const KickedModal = () => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
      <XCircle className="mx-auto text-red-500" size={64} />
      <h2 className="text-2xl font-bold mt-6 mb-4">Phiên đăng nhập hết hạn</h2>
      <p className="text-gray-600 mb-8">
        Tài khoản của bạn đã được đăng nhập trên một thiết bị khác.
        Vì lý do bảo mật, bạn đã bị đăng xuất khỏi thiết bị này.
      </p>{/* ⚡️ FIX: Sửa lỗi cú pháp từ </T> thành </p> */}
      <button
        onClick={() => window.location.reload()}
        className="w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition"
      >
        Đăng nhập lại
      </button>
    </div>
  </div>
);


// =====================================================
// COMPONENT: AppRouter (Bộ định tuyến chính)
// =====================================================
const AppRouter = () => {
  const { 
    authUser, 
    currentUser, 
    role, 
    isLoading, 
    needsOnboarding, 
    handleSignOut,
    setOnboardingCompleted // Lấy hàm này từ context
  } = useContext(AppContext);
  
  // Tải data ở đây, SAU KHI AppContext đã sẵn sàng
  const dataState = usePublicData(); 

  if (isLoading || dataState.loading) {
    return <GlobalLoader message="Đang tải dữ liệu..." />;
  }

  // Cung cấp DataContext cho các component con (Dashboards, v.v.)
  return (
    <DataContext.Provider value={dataState}>
      {!authUser ? (
        <LoginPage />
      ) : needsOnboarding ? (
        <OnboardingForm user={authUser} onComplete={setOnboardingCompleted} />
      ) : !currentUser ? (
        // Trường hợp lạ: đã auth, không cần onboarding, nhưng data user vẫn null
        // (Có thể do lỗi database)
        <GlobalLoader message="Lỗi khi tải dữ liệu người dùng..." />
      ) : role === 'admin' ? (
        <AdminDashboard user={currentUser} onLogout={handleSignOut} />
      ) : role === 'teacher' ? (
        <TeacherDashboard user={currentUser} onLogout={handleSignOut} />
      ) : (
        <StudentDashboard user={currentUser} onLogout={handleSignOut} />
      )}
    </DataContext.Provider>
  );
};


// =====================================================
// MAIN APP
// =====================================================
export default function ELearningSystem() {
  const authState = useAuth();
  // const dataState = usePublicData(); // ĐÃ DI CHUYỂN VÀO AppRouter
  
  // Xử lý logic xác nhận đăng nhập (session conflict)
  const { sessionConflict, proceedToLogin, handleSignOut, kicked } = authState;

  const onConfirmLogin = () => {
    if (sessionConflict) {
      proceedToLogin(sessionConflict.authUser, sessionConflict.role);
    }
  };

  const onCancelLogin = () => {
    handleSignOut(); // Đăng xuất người dùng khỏi thiết bị này
  };
  
  return (
    <AppContext.Provider value={authState}>
      {/* <DataContext.Provider value={dataState}> */}{/* ĐÃ DI CHUYỂN VÀO AppRouter */}
        {kicked && <KickedModal />}

        {sessionConflict && (
          <ConfirmLoginModal 
            onConfirm={onConfirmLogin}
            onCancel={onCancelLogin}
          />
        )}
        
        {!authState.isAuthReady ? (
          <GlobalLoader message="Đang kết nối..." />
        ) : (
          <AppRouter />
        )}
      {/* </DataContext.Provider> */}{/* ĐÃ DI CHUYỂN VÀO AppRouter */}
    </AppContext.Provider>
  );
}N VÀO AppRouter */}
        {kicked && <KickedModal />}

        {sessionConflict && (
          <ConfirmLoginModal 
            onConfirm={onConfirmLogin}
            onCancel={onCancelLogin}
          />
        )}
        
        {!authState.isAuthReady ? (
          <GlobalLoader message="Đang kết nối..." />
        ) : (
          <AppRouter />
        )}
      {/* </DataContext.Provider> */}{/* ĐÃ DI CHUYỂN VÀO AppRouter */}
    </AppContext.Provider>
  );
}