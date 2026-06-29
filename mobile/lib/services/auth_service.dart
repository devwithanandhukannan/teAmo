import 'dart:convert';
import 'api_client.dart';

class AuthService {
  static Future<Map<String, dynamic>> checkExists(String? username, String? email) async {
    final response = await ApiClient.post('/api/auth/check-exists', body: {
      if (username != null) 'username': username,
      if (email != null) 'email': email,
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> register(String name, String email, String password) async {
    final response = await ApiClient.post('/api/auth/register', body: {
      'username': name, // Map name to username in backend
      'email': email,
      'password': password,
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> login(String loginIdentifier, String password) async {
    final response = await ApiClient.post('/api/auth/login', body: {
      'loginIdentifier': loginIdentifier,
      'password': password,
    });
    
    final data = jsonDecode(response.body);
    if (response.statusCode == 200 && data['token'] != null) {
      await ApiClient.saveToken(data['token']);
    }
    return data;
  }
  
  static Future<Map<String, dynamic>> getLoginStatus(String authSessionId) async {
    final response = await ApiClient.get('/api/auth/login-status/$authSessionId');
    return jsonDecode(response.body);
  }

  static Future<void> logout() async {
    await ApiClient.removeToken();
  }
}
