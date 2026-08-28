#include <stdio.h>
#include <stdlib.h>
#include <sys/ipc.h>
#include <sys/msg.h>

#define QUEUE_KEY 1234
#define MESSAGE_SIZE 100

struct message {
    long type;
    char text[MESSAGE_SIZE];
};

int main(void) {
    int queue_id;
    struct message message;

    queue_id = msgget(QUEUE_KEY, 0666 | IPC_CREAT);
    if (queue_id == -1) {
        perror("msgget");
        return EXIT_FAILURE;
    }

    printf("Waiting for a type-1 message...\n");

    if (msgrcv(queue_id, &message, sizeof(message.text), 1, 0) == -1) {
        perror("msgrcv");
        return EXIT_FAILURE;
    }

    message.text[MESSAGE_SIZE - 1] = '\0';
    printf("Received message: %s\n", message.text);

    if (msgctl(queue_id, IPC_RMID, NULL) == -1) {
        perror("msgctl(IPC_RMID)");
        return EXIT_FAILURE;
    }

    printf("Message queue removed.\n");
    return EXIT_SUCCESS;
}
