import 'dart:convert';
import 'api_client.dart';

class FriendsService {
  static Future<List<dynamic>> getFriendsList() async {
    final response = await ApiClient.get('/api/friends/list');
    return jsonDecode(response.body);
  }

  static Future<List<dynamic>> scanNearby(double lat, double lng, {int maxDistance = 50}) async {
    final response = await ApiClient.post('/api/friends/scan', body: {
      'lat': lat,
      'lng': lng,
      'maxDistance': maxDistance
    });
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> followUser(String userId) async {
    final response = await ApiClient.post('/api/friends/follow/$userId');
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> trustLikeUser(String userId) async {
    final response = await ApiClient.post('/api/friends/trust-like/$userId');
    return jsonDecode(response.body);
  }

  static Future<List<dynamic>> getMessages(String friendId) async {
    final response = await ApiClient.get('/api/friends/messages/$friendId');
    return jsonDecode(response.body);
  }
}
