#include <stdio.h>
#include <stdlib.h>
#include <sys/ipc.h>
#include <sys/msg.h>
#include <string.h>

#define KEY 1234
#define SIZE 100

struct message {
    long type;
    char text[SIZE];
};

int main() {
    int msgid;
    struct message msg;

    msg.type = 1;

    // Get message queue
    msgid = msgget(KEY, 0666 | IPC_CREAT);

    if (msgid == -1) {
        perror("msgget error");
        return 1;
    }

    printf("Enter message: ");
    fgets(msg.text, SIZE, stdin);

    // Send message
    if (msgsnd(msgid, &msg, strlen(msg.text) + 1, 0) == -1) {
        perror("msgsnd error");
        return 1;
    }

    printf("Message sent!\n");

    return 0;
}