import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Provider.of<ChatProvider>(context, listen: false).loadFriends();
      Provider.of<ChatProvider>(context, listen: false).setupSocketListeners();
    });
  }

  void _logout() async {
    await Provider.of<AuthProvider>(context, listen: false).logout();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    
    final List<Widget> pages = [
      _MatchLoungeTab(),
      _FriendsListTab(),
      _ScannerTab(),
      _ProfileTab(user: auth.user, onLogout: _logout),
    ];

    return Scaffold(
      backgroundColor: const Color(0xFF090A0F),
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(80),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF13141A),
                borderRadius: BorderRadius.circular(32),
                border: Border.all(color: const Color(0xFF1E212B)),
              ),
              child: Row(
                children: [
                  const CircleAvatar(
                    backgroundColor: Color(0xFF1E212B),
                    radius: 16,
                    child: Icon(Icons.wifi_tethering, size: 16, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'HANGOUT',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                      ),
                      Text(
                        'POWERED BY KNEAZLLLE',
                        style: TextStyle(color: Colors.white54, fontSize: 8, letterSpacing: 0.5),
                      ),
                    ],
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E212B),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text('1 Online', style: TextStyle(color: Colors.white, fontSize: 12)),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    decoration: const BoxDecoration(
                      color: Color(0xFF1E212B),
                      shape: BoxShape.circle,
                    ),
                    padding: const EdgeInsets.all(6),
                    child: const Icon(Icons.notifications_none, color: Colors.white, size: 18),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: Stack(
        children: [
          Positioned.fill(child: pages[_currentIndex]),
          
          // Floating Bottom Navigation Bar
          Positioned(
            bottom: 30,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF13141A),
                  borderRadius: BorderRadius.circular(40),
                  border: Border.all(color: const Color(0xFF1E212B)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildNavItem(0, Icons.bolt),
                    const SizedBox(width: 8),
                    _buildNavItem(1, Icons.people_outline),
                    const SizedBox(width: 8),
                    _buildNavItem(2, Icons.explore_outlined),
                    const SizedBox(width: 8),
                    _buildNavItem(3, Icons.person_outline),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(int index, IconData icon) {
    final isSelected = _currentIndex == index;
    return GestureDetector(
      onTap: () => setState(() => _currentIndex = index),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          shape: BoxShape.circle,
        ),
        child: Icon(
          icon,
          color: isSelected ? Colors.black : Colors.white54,
          size: 20,
        ),
      ),
    );
  }
}

class _MatchLoungeTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: const Color(0xFF1E212B),
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Icon(Icons.bolt, color: Colors.amber, size: 40),
          ),
          const SizedBox(height: 24),
          const Text(
            'HANGOUT LOUNGE',
            style: TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Match with people around the world using interests or\nradar location.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white54, fontSize: 12),
          ),
          const SizedBox(height: 32),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            onPressed: () {},
            child: const Text('Match Stranger', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

class _FriendsListTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final chatProvider = Provider.of<ChatProvider>(context);
    final friends = chatProvider.friends;

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'FRIENDS LIST',
            style: TextStyle(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFF13141A),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: const Color(0xFF1E212B)),
              ),
              child: friends.isEmpty
                  ? const Center(
                      child: Text('No permanent friends yet.', style: TextStyle(color: Colors.white30)),
                    )
                  : ListView.builder(
                      itemCount: friends.length,
                      itemBuilder: (context, index) {
                        final friend = friends[index];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFF1E212B),
                            child: Text(friend['name']?[0] ?? '?', style: const TextStyle(color: Colors.white)),
                          ),
                          title: Text(friend['name'] ?? 'Unknown', style: const TextStyle(color: Colors.white)),
                          onTap: () => context.push('/chat/${friend['_id']}'),
                        );
                      },
                    ),
            ),
          ),
          const SizedBox(height: 120), // Spacer for bottom nav
        ],
      ),
    );
  }
}

class _ScannerTab extends StatefulWidget {
  @override
  State<_ScannerTab> createState() => _ScannerTabState();
}

class _ScannerTabState extends State<_ScannerTab> {
  double _proximity = 50;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.explore_outlined, color: Colors.blueAccent, size: 24),
              SizedBox(width: 8),
              Text(
                'Nearby Connections',
                style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Scan your geographic area to find other online matches looking for\ncompanions.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white54, fontSize: 12),
          ),
          const SizedBox(height: 48),
          
          // Concentric circles UI representation
          Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 250,
                height: 250,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF1E212B), width: 1),
                ),
              ),
              Container(
                width: 150,
                height: 150,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF1E212B), width: 1),
                ),
              ),
              Container(
                width: 60,
                height: 60,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.play_arrow, color: Colors.black, size: 30),
              ),
            ],
          ),
          
          const SizedBox(height: 48),
          
          // Proximity Slider
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 32),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF13141A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFF1E212B)),
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Scan Proximity Limit', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text('${_proximity.toInt()} km', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ],
                ),
                Slider(
                  value: _proximity,
                  min: 5,
                  max: 100,
                  activeColor: Colors.white,
                  inactiveColor: const Color(0xFF1E212B),
                  onChanged: (val) => setState(() => _proximity = val),
                ),
                const Text(
                  'Find active users within the selected distance boundary.',
                  style: TextStyle(color: Colors.white30, fontSize: 10),
                )
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6B4BFF), // Purple accent from screenshot
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
            icon: const Text('Start Scan', style: TextStyle(fontWeight: FontWeight.bold)),
            label: const Icon(Icons.radar, size: 18),
            onPressed: () {},
          ),
          
          const SizedBox(height: 120), // Spacer for bottom nav
        ],
      ),
    );
  }
}

class _ProfileTab extends StatelessWidget {
  final Map<String, dynamic>? user;
  final VoidCallback onLogout;

  const _ProfileTab({this.user, required this.onLogout});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 50,
            backgroundColor: const Color(0xFF1E212B),
            child: Text(
              user?['name']?[0] ?? 'U',
              style: const TextStyle(fontSize: 40, color: Colors.white),
            ),
          ),
          const SizedBox(height: 16),
          Text(user?['name'] ?? 'User Name', style: const TextStyle(fontSize: 24, color: Colors.white, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(user?['email'] ?? 'email@example.com', style: const TextStyle(color: Colors.white54)),
          const SizedBox(height: 32),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.redAccent.withValues(alpha: 0.2),
              foregroundColor: Colors.redAccent,
              elevation: 0,
            ),
            onPressed: onLogout,
            child: const Text('Logout'),
          ),
        ],
      ),
    );
  }
}
