import 'dart:convert';
import 'api_client.dart';

class ProfileService {
  static Future<Map<String, dynamic>> getProfile() async {
    final response = await ApiClient.get('/api/profile');
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> data) async {
    final response = await ApiClient.put('/api/profile', body: data);
    return jsonDecode(response.body);
  }
}
