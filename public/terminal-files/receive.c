#include <stdio.h>
#include <stdlib.h>
#include <sys/ipc.h>
#include <sys/msg.h>

#define KEY 1234
#define SIZE 100

struct message {
    long type;
    char text[SIZE];
};

int main() {
    int msgid;
    struct message msg;

    // Get message queue
    msgid = msgget(KEY, 0666 | IPC_CREAT);

    if (msgid == -1) {
        perror("msgget error");
        return 1;
    }

    // Receive message of type 1
    if (msgrcv(msgid, &msg, sizeof(msg.text), 1, 0) == -1) {
        perror("msgrcv error");
        return 1;
    }

    printf("Received message: %s\n", msg.text);

    return 0;
}