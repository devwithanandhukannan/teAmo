import 'dart:convert';
import 'dart:io';
import 'api_client.dart';

class SnapsService {
  static Future<List<dynamic>> getSnapsFeed() async {
    final response = await ApiClient.get('/api/snaps');
    return jsonDecode(response.body);
  }

  static Future<Map<String, dynamic>> createSnap(File image, String caption) async {
    final response = await ApiClient.postMultipart(
      '/api/snaps',
      'image',
      image,
      fields: {'caption': caption}
    );
    
    final responseBody = await response.stream.bytesToString();
    return jsonDecode(responseBody);
  }
}
