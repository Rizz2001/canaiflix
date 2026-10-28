package com.canaimaflix.app;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * En Android 4.1 - 4.4 (API 16-19) TLS 1.1 y 1.2 estan soportados pero DESACTIVADOS por defecto
 * en los sockets de cliente. Muchos servidores actuales exigen TLS 1.2, asi que sin esto
 * HttpsURLConnection (y por tanto ExoPlayer) falla el handshake. Este wrapper los activa.
 */
public class Tls12SocketFactory extends SSLSocketFactory {
    private static final String[] PROTOCOLS = new String[] { "TLSv1.2", "TLSv1.1", "TLSv1" };
    private final SSLSocketFactory delegate;

    public Tls12SocketFactory(SSLSocketFactory delegate) {
        this.delegate = delegate;
    }

    private Socket enable(Socket socket) {
        if (socket instanceof SSLSocket) {
            try {
                ((SSLSocket) socket).setEnabledProtocols(PROTOCOLS);
            } catch (Exception ignored) {
                // Si algun protocolo no existe se deja la configuracion por defecto
            }
        }
        return socket;
    }

    @Override public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
    @Override public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }

    @Override public Socket createSocket(Socket s, String host, int port, boolean autoClose) throws IOException {
        return enable(delegate.createSocket(s, host, port, autoClose));
    }
    @Override public Socket createSocket(String host, int port) throws IOException {
        return enable(delegate.createSocket(host, port));
    }
    @Override public Socket createSocket(String host, int port, InetAddress localHost, int localPort) throws IOException {
        return enable(delegate.createSocket(host, port, localHost, localPort));
    }
    @Override public Socket createSocket(InetAddress host, int port) throws IOException {
        return enable(delegate.createSocket(host, port));
    }
    @Override public Socket createSocket(InetAddress address, int port, InetAddress localAddress, int localPort) throws IOException {
        return enable(delegate.createSocket(address, port, localAddress, localPort));
    }
}
