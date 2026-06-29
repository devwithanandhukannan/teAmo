import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/chat_provider.dart';
import 'router.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  final AuthProvider _authProvider = AuthProvider();

  @override
  void initState() {
    super.initState();
    _authProvider.checkAuthStatus();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: _authProvider),
        ChangeNotifierProvider(create: (_) => ChatProvider()),
      ],
      child: Consumer<AuthProvider>(
        builder: (context, auth, _) {
          if (auth.isLoading) {
            return const MaterialApp(
              home: Scaffold(
                backgroundColor: Color(0xFF121212),
                body: Center(
                  child: CircularProgressIndicator(color: Colors.pinkAccent),
                ),
              ),
            );
          }
          
          final router = AppRouter.createRouter(auth);
          return MaterialApp.router(
            title: 'Te Amo',
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              fontFamily: 'Roboto', // Use a clean sans-serif like Roboto or Inter
              scaffoldBackgroundColor: const Color(0xFF090A0F),
              brightness: Brightness.dark,
              primaryColor: const Color(0xFF6B4BFF), // Purple accent
              colorScheme: const ColorScheme.dark(
                primary: Color(0xFF6B4BFF),
                surface: Color(0xFF13141A),
              ),
              appBarTheme: const AppBarTheme(
                backgroundColor: Color(0xFF090A0F),
                elevation: 0,
              ),
              elevatedButtonTheme: ElevatedButtonThemeData(
                style: ElevatedButton.styleFrom(
                  elevation: 0,
                ),
              ),
            ),
            routerConfig: router,
          );
        },
      ),
    );
  }
}
