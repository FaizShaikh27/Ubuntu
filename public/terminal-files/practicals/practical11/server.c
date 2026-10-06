/* Practical 11: Start this server before running client.c. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

#define SOCKET_PATH "/tmp/unix_socket"
#define BUFFER_SIZE 100

int main(void) {
    int server_sock = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un addr;
    char buffer[BUFFER_SIZE];
    if (server_sock < 0) { perror("socket"); return 1; }
    unlink(SOCKET_PATH);
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, SOCKET_PATH, sizeof(addr.sun_path) - 1);
    if (bind(server_sock, (struct sockaddr *)&addr, sizeof(addr)) == -1) {
        perror("bind"); close(server_sock); return 1;
    }
    if (listen(server_sock, 5) == -1) {
        perror("listen"); close(server_sock); unlink(SOCKET_PATH); return 1;
    }
    printf("Server is listening on %s...\n", SOCKET_PATH);
    int client_sock = accept(server_sock, NULL, NULL);
    if (client_sock == -1) {
        perror("accept"); close(server_sock); unlink(SOCKET_PATH); return 1;
    }
    int bytes = read(client_sock, buffer, sizeof(buffer) - 1);
    if (bytes < 0) {
        perror("read"); close(client_sock); close(server_sock); unlink(SOCKET_PATH); return 1;
    }
    buffer[bytes] = '\0';
    printf("Received from client: %s\n", buffer);
    const char *response = "Hello from server!";
    int status = 0;
    if (write(client_sock, response, strlen(response)) != strlen(response)) {
        perror("write"); status = 1;
    }
    close(client_sock);
    close(server_sock);
    unlink(SOCKET_PATH);
    return status;
}
