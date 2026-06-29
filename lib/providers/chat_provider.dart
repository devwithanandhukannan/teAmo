import 'package:flutter/foundation.dart';
import '../services/friends_service.dart';
import '../services/socket_service.dart';

class ChatProvider with ChangeNotifier {
  List<dynamic> _friends = [];
  Map<String, List<dynamic>> _messages = {};
  
  List<dynamic> get friends => _friends;

  Future<void> loadFriends() async {
    try {
      _friends = await FriendsService.getFriendsList();
      notifyListeners();
    } catch (e) {
      print('Load friends error: $e');
    }
  }

  List<dynamic> getMessagesFor(String friendId) {
    return _messages[friendId] ?? [];
  }

  Future<void> loadMessages(String friendId) async {
    try {
      final msgs = await FriendsService.getMessages(friendId);
      _messages[friendId] = msgs;
      notifyListeners();
    } catch (e) {
      print('Load messages error: $e');
    }
  }

  void setupSocketListeners() {
    SocketService.onMessageReceived((data) {
      final senderId = data['sender'];
      if (_messages.containsKey(senderId)) {
        _messages[senderId]!.add(data);
      } else {
        _messages[senderId] = [data];
      }
      notifyListeners();
    });
  }

  void sendMessage(String friendId, String content) {
    SocketService.sendMessage(friendId, content);
    
    // Optimistic UI update
    final newMessage = {
      'sender': 'me', // handled differently on UI side usually by checking against current user ID
      'receiver': friendId,
      'content': content,
      'createdAt': DateTime.now().toIso8601String()
    };
    
    if (_messages.containsKey(friendId)) {
      _messages[friendId]!.add(newMessage);
    } else {
      _messages[friendId] = [newMessage];
    }
    notifyListeners();
  }
}
