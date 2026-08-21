#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <string.h>

#define FIFO_NAME "/tmp/myfifo"

int main()
{
    int fd;
    char *message = "Hello from writer process!\n";

    fd = open(FIFO_NAME, O_WRONLY);

    if (fd == -1)
    {
        perror("open");
        exit(EXIT_FAILURE);
    }

    write(fd, message, strlen(message));

    printf("Writer: Message sent.\n");

    close(fd);

    return 0;
}