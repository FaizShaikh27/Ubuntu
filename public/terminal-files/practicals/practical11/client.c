/* Practical 11: Run in the second terminal pane after starting server. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#define SOCKET_PATH "/tmp/unix_socket"
#define BUFFER_SIZE 100

int main(void) {
    int sock = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un addr;
    char buffer[BUFFER_SIZE];
    if (sock < 0) { perror("socket"); return 1; }
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCKET_PATH, sizeof(addr.sun_path) - 1);
    if (connect(sock, (struct sockaddr *)&addr, sizeof(addr)) == -1) {
        perror("connect (start the server first)"); close(sock); return 1;
    }
    const char *message = "Hello from client!";
    if (write(sock, message, strlen(message)) != strlen(message)) {
        perror("write"); close(sock); return 1;
    }
    int bytes = read(sock, buffer, sizeof(buffer) - 1);
    if (bytes < 0) { perror("read"); close(sock); return 1; }
    buffer[bytes] = '\0';
    printf("Received from server: %s\n", buffer);
    close(sock);
    return 0;
}
