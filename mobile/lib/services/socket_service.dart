import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'api_client.dart';

class SocketService {
  static IO.Socket? _socket;

  static IO.Socket? get socket => _socket;

  static Future<void> initSocket(String userId) async {
    final token = await ApiClient.getToken();
    if (token == null) return;

    _socket = IO.io(ApiClient.baseUrl, IO.OptionBuilder()
      .setTransports(['websocket'])
      .disableAutoConnect()
      .setAuth({'token': token})
      .build()
    );

    _socket!.connect();

    _socket!.onConnect((_) {
      print('Socket connected: ${_socket!.id}');
      _socket!.emit('join', userId);
    });

    _socket!.onDisconnect((_) => print('Socket disconnected'));
  }

  static void disconnect() {
    _socket?.disconnect();
    _socket = null;
  }
  
  static void sendMessage(String receiverId, String content) {
    if (_socket != null && _socket!.connected) {
      _socket!.emit('send-message', {
        'receiverId': receiverId,
        'content': content
      });
    }
  }
  
  static void onMessageReceived(Function(dynamic) callback) {
    _socket?.on('receive-message', callback);
  }
}
