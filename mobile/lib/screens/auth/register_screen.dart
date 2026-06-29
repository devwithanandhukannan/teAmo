import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import 'dart:async';
import '../../providers/auth_provider.dart';
import '../../services/auth_service.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _isLoading = false;
  String _error = '';

  Timer? _debounce;
  bool _isCheckingUsername = false;
  bool _isCheckingEmail = false;
  String? _usernameError;
  String? _emailError;

  @override
  void initState() {
    super.initState();
    _nameController.addListener(_onUsernameChanged);
    _emailController.addListener(_onEmailChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _onUsernameChanged() {
    if (_debounce?.isActive ?? false) _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () async {
      final username = _nameController.text.trim();
      if (username.length < 3) {
        setState(() => _usernameError = null);
        return;
      }
      setState(() => _isCheckingUsername = true);
      try {
        final res = await AuthService.checkExists(username, null);
        setState(() {
          _usernameError = res['usernameExists'] == true ? 'Username is already taken' : null;
        });
      } finally {
        setState(() => _isCheckingUsername = false);
      }
    });
  }

  void _onEmailChanged() {
    if (_debounce?.isActive ?? false) _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () async {
      final email = _emailController.text.trim();
      final emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
      if (!emailRegex.hasMatch(email)) {
        setState(() => _emailError = 'Enter a valid email address');
        return;
      }
      setState(() => _emailError = null);
      setState(() => _isCheckingEmail = true);
      try {
        final res = await AuthService.checkExists(null, email);
        setState(() {
          _emailError = res['emailExists'] == true ? 'Email is already registered' : null;
        });
      } finally {
        setState(() => _isCheckingEmail = false);
      }
    });
  }

  void _register() async {
    if (_usernameError != null || _emailError != null) return;
    
    setState(() {
      _isLoading = true;
      _error = '';
    });

    final auth = Provider.of<AuthProvider>(context, listen: false);
    await auth.register(
      _nameController.text.trim(),
      _emailController.text.trim(),
      _passwordController.text,
    );
    
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthProvider>(
      builder: (context, auth, _) {
        // If pending verification, show the waiting screen instead
        if (auth.isPendingVerification) {
          return _buildWaitingScreen(auth);
        }

        // If authenticated (e.g. admin bypass), redirect to home
        if (auth.isAuthenticated) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            context.go('/');
          });
        }

        return _buildRegisterForm();
      },
    );
  }

  Widget _buildWaitingScreen(AuthProvider auth) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0E14),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.mark_email_unread_outlined, color: Color(0xFF6B4BFF), size: 80),
              const SizedBox(height: 24),
              const Text(
                'Check Your Email',
                style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              Text(
                'We sent a magic link to ${auth.pendingEmail}. Click it to verify your account.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white54, fontSize: 16),
              ),
              const SizedBox(height: 48),
              const CircularProgressIndicator(color: Color(0xFF6B4BFF)),
              const SizedBox(height: 24),
              TextButton(
                onPressed: () => auth.cancelPendingVerification(),
                child: const Text('Cancel & Go Back', style: TextStyle(color: Colors.white30)),
              )
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRegisterForm() {
    final bool isFormValid = _nameController.text.isNotEmpty && 
                             _emailController.text.isNotEmpty && 
                             _passwordController.text.isNotEmpty &&
                             _usernameError == null && 
                             _emailError == null;

    return Scaffold(
      backgroundColor: const Color(0xFF0B0E14), // Dark background
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.wifi_tethering, size: 48, color: Colors.white),
                const SizedBox(height: 24),
                const Text(
                  'Create Account',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Join Hangout powered by kneazllle',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white54, fontSize: 14),
                ),
                const SizedBox(height: 48),
                if (_error.isNotEmpty)
                  Container(
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: Colors.redAccent.withValues(alpha: 0.1),
                      border: Border.all(color: Colors.redAccent.withValues(alpha: 0.3)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(_error, style: const TextStyle(color: Colors.redAccent, fontSize: 14)),
                  ),
                _buildTextField(
                  controller: _nameController, 
                  label: 'Username', 
                  icon: Icons.person_outline,
                  errorText: _usernameError,
                  isLoading: _isCheckingUsername,
                ),
                const SizedBox(height: 16),
                _buildTextField(
                  controller: _emailController, 
                  label: 'Email', 
                  icon: Icons.email_outlined,
                  errorText: _emailError,
                  isLoading: _isCheckingEmail,
                ),
                const SizedBox(height: 16),
                _buildTextField(
                  controller: _passwordController, 
                  label: 'Password', 
                  icon: Icons.lock_outline, 
                  isPassword: true
                ),
                const SizedBox(height: 32),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.black,
                    disabledBackgroundColor: Colors.white30,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  onPressed: _isLoading || !isFormValid ? null : _register,
                  child: _isLoading 
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                      : const Text('Continue', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                ),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('Already have an account?', style: TextStyle(color: Colors.white54)),
                    TextButton(
                      onPressed: () => context.go('/login'),
                      child: const Text('Sign in', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller, 
    required String label, 
    required IconData icon, 
    bool isPassword = false,
    String? errorText,
    bool isLoading = false,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: controller,
          obscureText: isPassword,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: label,
            labelStyle: const TextStyle(color: Colors.white54),
            prefixIcon: Icon(icon, color: Colors.white54),
            suffixIcon: isLoading ? const Padding(
              padding: EdgeInsets.all(12.0),
              child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white54)),
            ) : null,
            filled: true,
            fillColor: const Color(0xFF13141A), // Input background
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: Color(0xFF1E212B)), // Dark border
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: Color(0xFF1E212B)),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: const BorderSide(color: Colors.white30),
            ),
          ),
        ),
        if (errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: 8.0, left: 16.0),
            child: Text(errorText, style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
          ),
      ],
    );
  }
}
