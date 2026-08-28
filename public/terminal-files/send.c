#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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

    message.type = 1;
    printf("Enter message: ");
    fflush(stdout);

    if (fgets(message.text, sizeof(message.text), stdin) == NULL) {
        fprintf(stderr, "Could not read the message.\n");
        return EXIT_FAILURE;
    }

    message.text[strcspn(message.text, "\n")] = '\0';

    if (msgsnd(queue_id, &message, strlen(message.text) + 1, 0) == -1) {
        perror("msgsnd");
        return EXIT_FAILURE;
    }

    printf("Message sent.\n");
    return EXIT_SUCCESS;
}
