import 'dart:async';
import 'package:flutter/foundation.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/profile_service.dart';
import '../services/socket_service.dart';

class AuthProvider with ChangeNotifier {
  bool _isAuthenticated = false;
  Map<String, dynamic>? _user;
  bool _isLoading = true;
  
  bool _isPendingVerification = false;
  String? _pendingEmail;

  bool get isAuthenticated => _isAuthenticated;
  Map<String, dynamic>? get user => _user;
  bool get isLoading => _isLoading;
  bool get isPendingVerification => _isPendingVerification;
  String? get pendingEmail => _pendingEmail;

  Future<void> checkAuthStatus() async {
    final token = await ApiClient.getToken();
    if (token != null) {
      try {
        final profile = await ProfileService.getProfile();
        _user = profile;
        _isAuthenticated = true;
        SocketService.initSocket(_user!['_id']);
      } catch (e) {
        // Token might be expired or invalid
        await logout();
      }
    }
    _isLoading = false;
    notifyListeners();
  }

  // Returns true if fully logged in (like admin bypass), false otherwise.
  // Sets pending verification state if needed.
  Future<bool> login(String loginIdentifier, String password) async {
    try {
      final data = await AuthService.login(loginIdentifier, password);
      
      if (data['success'] == true) {
        if (data['pendingVerification'] == true) {
          _isPendingVerification = true;
          _pendingEmail = data['email'];
          notifyListeners();
          _pollLoginStatus(data['authSessionId']);
          return false; // Not fully logged in yet
        } else if (data['token'] != null) {
          // Bypass case (like admin)
          _user = data['user'];
          _isAuthenticated = true;
          SocketService.initSocket(_user!['_id']);
          notifyListeners();
          return true;
        }
      }
      return false;
    } catch (e) {
      // ignore: avoid_print
      print('Login error: $e');
      return false;
    }
  }

  Future<bool> register(String name, String email, String password) async {
    try {
      final data = await AuthService.register(name, email, password);
      if (data['success'] == true) {
        if (data['pendingVerification'] == true) {
          _isPendingVerification = true;
          _pendingEmail = data['email'];
          notifyListeners();
          _pollLoginStatus(data['authSessionId']);
          return false;
        }
      }
      return false;
    } catch (e) {
      // ignore: avoid_print
      print('Register error: $e');
      return false;
    }
  }

  void _pollLoginStatus(String authSessionId) {
    Timer.periodic(const Duration(seconds: 3), (timer) async {
      if (!_isPendingVerification) {
        timer.cancel();
        return;
      }
      try {
        final data = await AuthService.getLoginStatus(authSessionId);
        if (data['status'] == 'verified' && data['token'] != null) {
          timer.cancel();
          await ApiClient.saveToken(data['token']);
          _user = data['user'];
          _isAuthenticated = true;
          _isPendingVerification = false;
          SocketService.initSocket(_user!['_id']);
          notifyListeners();
        } else if (data['status'] == 'expired') {
          timer.cancel();
          _isPendingVerification = false;
          notifyListeners();
        }
      } catch (e) {
        // ignore: avoid_print
        print('Polling error: $e');
      }
    });
  }
  
  void cancelPendingVerification() {
    _isPendingVerification = false;
    _pendingEmail = null;
    notifyListeners();
  }

  Future<void> logout() async {
    await AuthService.logout();
    _isAuthenticated = false;
    _user = null;
    _isPendingVerification = false;
    SocketService.disconnect();
    notifyListeners();
  }
}
