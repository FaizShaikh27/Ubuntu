#include <stdio.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>

#define FIFO_NAME "/tmp/myfifo"
#define BUFFER_SIZE 128

int main()
{
    int fd;
    char buffer[BUFFER_SIZE];

    fd = open(FIFO_NAME, O_RDONLY);

    if (fd == -1)
    {
        perror("open");
        exit(EXIT_FAILURE);
    }

    int n = read(fd, buffer, BUFFER_SIZE - 1);

    if (n == -1)
    {
        perror("read");
        close(fd);
        exit(EXIT_FAILURE);
    }

    buffer[n] = '\0';

    printf("Reader: Received message: %s", buffer);

    close(fd);

    return 0;
}